import Album from '../models/Album.js';
import Favourite from '../models/Favourite.js';
import { serializeTrack } from '../utils/serialize.js';
import { albumsFor, resolveRef, expandTrackRefs } from '../utils/trackRefs.js';

/** Check the track is real before recording a mark against it. */
async function findTrackOr404(albumId, trackId) {
  if (!albumId || !trackId) {
    throw Object.assign(new Error('albumId and trackId are required'), { status: 400 });
  }

  const album = await Album.findById(albumId);
  if (!album?.tracks.id(trackId)) {
    throw Object.assign(new Error('Track not found'), { status: 404 });
  }
}

// GET /api/favourites  — the caller's marked tracks, most recent first
export async function listFavourites(req, res) {
  const favourites = await Favourite.find({ owner: req.user._id }).sort('-createdAt');
  const byId = await albumsFor(favourites);

  const tracks = favourites
    .map((favourite) => {
      const resolved = resolveRef(byId, favourite);
      if (!resolved) return null;

      return {
        ...serializeTrack(resolved.track.toJSON(), resolved.album),
        favouritedAt: favourite.createdAt,
      };
    })
    // A mark on a track whose album has since been deleted simply stops
    // showing, rather than failing the list.
    .filter(Boolean);

  res.json({
    data: tracks,
    totalDuration: tracks.reduce((sum, track) => sum + (track.duration || 0), 0),
  });
}

/**
 * GET /api/favourites/ids  — just which tracks are marked.
 *
 * The star on a track has to know its own state, and every list in the app
 * shows tracks. Fetching the ids once is what lets those render from memory
 * instead of asking the server per row.
 */
export async function listFavouriteIds(req, res) {
  const favourites = await Favourite.find({ owner: req.user._id }).select('track').lean();

  res.json({ data: favourites.map((favourite) => favourite.track.toString()) });
}

// POST /api/favourites  { albumId, trackId }
export async function addFavourite(req, res) {
  const { albumId, trackId } = req.body;
  await findTrackOr404(albumId, trackId);

  // Marking an already-marked track is a no-op rather than an error: the
  // caller wanted it favourited, and it is. The unique index makes the upsert
  // safe against two tabs doing it at once.
  await Favourite.updateOne(
    { owner: req.user._id, album: albumId, track: trackId },
    { $setOnInsert: { owner: req.user._id, album: albumId, track: trackId } },
    { upsert: true }
  );

  res.status(201).json({ trackId, favourite: true });
}

/**
 * POST /api/favourites/bulk
 *   { albumId }  or  { items: [{ albumId, trackId }] }
 *
 * Starring a run of tracks in one go — a whole record, or a hand-picked few.
 *
 * One bulkWrite of upserts rather than a loop of requests: marking something
 * already marked stays a no-op, and `upsertedCount` is exactly how many were
 * genuinely new, so the reply can say what actually happened rather than
 * claiming everything was added.
 */
export async function addFavourites(req, res) {
  const refs = await expandTrackRefs(req.body);

  const operations = refs.map(({ album, track }) => ({
    updateOne: {
      filter: { owner: req.user._id, album: album._id, track: track._id },
      update: {
        $setOnInsert: { owner: req.user._id, album: album._id, track: track._id },
      },
      upsert: true,
    },
  }));

  // An empty album is not an error; it simply has nothing to star.
  const result = operations.length ? await Favourite.bulkWrite(operations) : { upsertedCount: 0 };
  const added = result.upsertedCount ?? 0;

  res.status(201).json({
    added,
    skipped: refs.length - added,
    // What was asked for, marked or already marked — the client lights these
    // stars without re-fetching the list.
    trackIds: refs.map(({ track }) => track._id.toString()),
  });
}

/**
 * DELETE /api/favourites/bulk
 *   { albumId }  or  { items: [{ albumId, trackId }] }
 *
 * The other half of the bulk add: unstar a whole record, or a chosen few.
 *
 * Like the single remove, this is idempotent — anything in the list that was
 * not starred simply was not there to delete — and it only ever reaches the
 * caller's own marks.
 */
export async function removeFavourites(req, res) {
  const refs = await expandTrackRefs(req.body);

  // An empty album names nothing; an empty $or is not a query Mongo accepts.
  if (refs.length === 0) return res.json({ removed: 0, trackIds: [] });

  const result = await Favourite.deleteMany({
    owner: req.user._id,
    $or: refs.map(({ album, track }) => ({ album: album._id, track: track._id })),
  });

  res.json({
    removed: result.deletedCount ?? 0,
    // Everything asked for, so the client can put out exactly these stars.
    trackIds: refs.map(({ track }) => track._id.toString()),
  });
}

// DELETE /api/favourites/:albumId/:trackId
export async function removeFavourite(req, res) {
  const { albumId, trackId } = req.params;

  // Unmarking something that is not marked leaves the world in the state the
  // caller asked for, so it is not an error either.
  await Favourite.deleteOne({ owner: req.user._id, album: albumId, track: trackId });

  res.status(204).end();
}
