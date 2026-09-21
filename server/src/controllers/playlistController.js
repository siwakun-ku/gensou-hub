import Album from '../models/Album.js';
import Playlist from '../models/Playlist.js';
import Favourite from '../models/Favourite.js';
import { serializePlaylist, serializeTrack } from '../utils/serialize.js';
import { streamPlaylistArchive } from '../services/archive.js';
import { signDownloadToken } from '../utils/token.js';
import { albumsFor, resolveRef, expandTrackRefs } from '../utils/trackRefs.js';

/**
 * The one playlist nobody creates.
 *
 * Every account has it, and its contents are not stored anywhere: they are the
 * tracks the listener has starred, read fresh each time. Keeping a real
 * Playlist document in step with the favourites collection would mean two
 * sources of truth for the same thing and a sync to get wrong on every toggle;
 * deriving it means it simply cannot drift.
 *
 * The price is that it is read-only as a playlist — it is edited by starring
 * tracks, not by adding entries to it — which is what the guard below enforces.
 */
const FAVOURITES_ID = 'favourites';

/** The starred tracks, as album/track document pairs in most-recent order. */
async function favouriteEntries(user) {
  const favourites = await Favourite.find({ owner: user._id }).sort('-createdAt');
  const byId = await albumsFor(favourites);

  return favourites.map((favourite) => resolveRef(byId, favourite)).filter(Boolean);
}

async function favouritesPlaylist(user) {
  const entries = await favouriteEntries(user);
  const tracks = entries.map(({ album, track }) => serializeTrack(track.toJSON(), album));

  return {
    id: FAVOURITES_ID,
    name: 'Favourites',
    description: 'Every track you have starred.',
    // What tells a client this one cannot be renamed, emptied or deleted.
    isDefault: true,
    trackCount: tracks.length,
    totalDuration: tracks.reduce((sum, track) => sum + (track.duration || 0), 0),
    downloadUrl: tracks.length ? `/api/playlists/${FAVOURITES_ID}/download` : null,
    tracks,
  };
}

/**
 * Load a playlist and refuse it unless the caller owns it. Ownership failures
 * are 404, not 403: whether someone else's playlist exists is not the
 * requester's business.
 */
async function findOwnedOr404(id, user) {
  // Caught here rather than at each route: every write goes through this, and
  // the id is not an ObjectId either, so the lookup below would fail anyway
  // with a much less useful message.
  if (id === FAVOURITES_ID) {
    throw Object.assign(
      new Error('Favourites is built from the tracks you star, so it cannot be edited as a playlist'),
      { status: 400 }
    );
  }

  const playlist = await Playlist.findOne({ _id: id, owner: user._id });
  if (!playlist) throw Object.assign(new Error('Playlist not found'), { status: 404 });
  return playlist;
}

/**
 * The album document and track subdocument behind each entry, in playlist
 * order, with the stale ones dropped. What the archive needs, since it works
 * from files on disk rather than from the serialized shape.
 */
async function resolveEntries(playlist) {
  const byId = await albumsFor(playlist.items);

  return playlist.items.map((item) => resolveRef(byId, item)).filter(Boolean);
}

/** Build a resolver that turns playlist entries into playable tracks. */
async function buildResolver(playlists) {
  const byId = await albumsFor(playlists.flatMap((playlist) => playlist.items));

  return (item) => {
    // A stale entry is dropped from the response rather than failing it.
    const resolved = resolveRef(byId, item);
    if (!resolved) return null;

    // itemId is what removal and reordering address; a track id would be
    // ambiguous if the same track were ever added twice.
    return {
      ...serializeTrack(resolved.track.toJSON(), resolved.album),
      itemId: item._id.toString(),
    };
  };
}

/** Mongo's unique index speaks in error codes; the client needs a sentence. */
function asDuplicateNameError(err) {
  if (err.code === 11000) {
    return Object.assign(new Error('You already have a playlist with that name'), { status: 409 });
  }
  return err;
}

// GET /api/playlists  — the caller's own playlists, favourites first
export async function listPlaylists(req, res) {
  const [favourites, playlists] = await Promise.all([
    favouritesPlaylist(req.user),
    Playlist.find({ owner: req.user._id }).sort('name'),
  ]);
  const resolve = await buildResolver(playlists);

  // Pinned to the top: it is the one every account has, and the one that fills
  // itself in as they listen.
  res.json({
    data: [favourites, ...playlists.map((playlist) => serializePlaylist(playlist, resolve))],
  });
}

// GET /api/playlists/:id
export async function getPlaylist(req, res) {
  if (req.params.id === FAVOURITES_ID) {
    return res.json(await favouritesPlaylist(req.user));
  }

  const playlist = await findOwnedOr404(req.params.id, req.user);
  const resolve = await buildResolver([playlist]);

  res.json(serializePlaylist(playlist, resolve));
}

// POST /api/playlists
export async function createPlaylist(req, res) {
  const { name, description } = req.body;

  try {
    const playlist = await Playlist.create({ owner: req.user._id, name, description });
    res.status(201).json(serializePlaylist(playlist));
  } catch (err) {
    throw asDuplicateNameError(err);
  }
}

// PUT /api/playlists/:id  — rename or re-describe
export async function updatePlaylist(req, res) {
  const playlist = await findOwnedOr404(req.params.id, req.user);

  for (const field of ['name', 'description']) {
    if (req.body[field] !== undefined) playlist[field] = req.body[field];
  }

  try {
    await playlist.save();
  } catch (err) {
    throw asDuplicateNameError(err);
  }

  const resolve = await buildResolver([playlist]);
  res.json(serializePlaylist(playlist, resolve));
}

/**
 * POST /api/playlists/:id/download-token
 *
 * A download is a plain browser navigation and cannot carry the Authorization
 * header, so the owner trades their session for a short-lived credential that
 * can travel in the URL instead.
 */
export async function createDownloadToken(req, res) {
  // Favourites is read-only as a playlist but not unreadable: downloading it is
  // a read, so it is allowed where editing is not.
  if (req.params.id === FAVOURITES_ID) {
    return res.json({ token: signDownloadToken(req.user, `playlist:${FAVOURITES_ID}`) });
  }

  const playlist = await findOwnedOr404(req.params.id, req.user);

  res.json({ token: signDownloadToken(req.user, `playlist:${playlist._id}`) });
}

// GET /api/playlists/:id/download  — every track, zipped on the fly
export async function downloadPlaylist(req, res) {
  if (req.params.id === FAVOURITES_ID) {
    return streamPlaylistArchive(
      { name: 'Favourites' },
      await favouriteEntries(req.user),
      res
    );
  }

  const playlist = await findOwnedOr404(req.params.id, req.user);
  const entries = await resolveEntries(playlist);

  await streamPlaylistArchive(playlist, entries, res);
}

// DELETE /api/playlists/:id
export async function deletePlaylist(req, res) {
  const playlist = await findOwnedOr404(req.params.id, req.user);

  await Playlist.deleteOne({ _id: playlist._id });
  res.status(204).end();
}

// POST /api/playlists/:id/items  { albumId, trackId }
export async function addItem(req, res) {
  const playlist = await findOwnedOr404(req.params.id, req.user);
  const { albumId, trackId } = req.body;

  if (!albumId || !trackId) {
    throw Object.assign(new Error('albumId and trackId are required'), { status: 400 });
  }

  // Check the track exists before storing a reference to it.
  const album = await Album.findById(albumId);
  if (!album?.tracks.id(trackId)) {
    throw Object.assign(new Error('Track not found'), { status: 404 });
  }

  // Adding the same track twice is a no-op rather than an error: the caller
  // wanted it on the playlist, and it is.
  if (!playlist.hasTrack(albumId, trackId)) {
    playlist.items.push({ album: albumId, track: trackId });
    await playlist.save();
  }

  const resolve = await buildResolver([playlist]);
  res.status(201).json(serializePlaylist(playlist, resolve));
}

/**
 * POST /api/playlists/:id/items/bulk
 *   { albumId }  or  { items: [{ albumId, trackId }] }
 *
 * Adding a run of tracks in one go. Tracks already on the playlist are counted
 * and skipped rather than refused — the caller asked for these to be on it, and
 * those are — and the whole lot is written in a single save instead of one
 * round trip per track.
 */
export async function addItems(req, res) {
  const playlist = await findOwnedOr404(req.params.id, req.user);
  const refs = await expandTrackRefs(req.body);

  let added = 0;

  for (const { album, track } of refs) {
    // hasTrack reads the items as they stand, so a track pushed a moment ago
    // in this same loop counts as already there.
    if (playlist.hasTrack(album._id, track._id)) continue;

    playlist.items.push({ album: album._id, track: track._id });
    added += 1;
  }

  if (added > 0) await playlist.save();

  const resolve = await buildResolver([playlist]);

  res.status(201).json({
    added,
    skipped: refs.length - added,
    playlist: serializePlaylist(playlist, resolve),
  });
}

// DELETE /api/playlists/:id/items/:itemId
export async function removeItem(req, res) {
  const playlist = await findOwnedOr404(req.params.id, req.user);

  const item = playlist.items.id(req.params.itemId);
  if (!item) throw Object.assign(new Error('Playlist entry not found'), { status: 404 });

  item.deleteOne();
  await playlist.save();

  const resolve = await buildResolver([playlist]);
  res.json(serializePlaylist(playlist, resolve));
}

// PUT /api/playlists/:id/items  { itemIds: [...] }  — the new running order
export async function reorderItems(req, res) {
  const playlist = await findOwnedOr404(req.params.id, req.user);
  const { itemIds } = req.body;

  const invalid = () =>
    Object.assign(new Error('itemIds must list every entry exactly once'), { status: 400 });

  if (!Array.isArray(itemIds) || itemIds.length !== playlist.items.length) throw invalid();

  const byId = new Map(playlist.items.map((item) => [item._id.toString(), item]));
  const reordered = itemIds.map((id) => byId.get(String(id)));
  // A missing or repeated id means the client's view of the playlist is stale;
  // reordering against it would silently drop entries.
  if (reordered.some((item) => !item) || new Set(itemIds.map(String)).size !== itemIds.length) {
    throw invalid();
  }

  playlist.items = reordered;
  await playlist.save();

  const resolve = await buildResolver([playlist]);
  res.json(serializePlaylist(playlist, resolve));
}
