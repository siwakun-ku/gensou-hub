import Album from '../models/Album.js';

/**
 * Looking up tracks that are stored as { album, track } id pairs.
 *
 * Playlists and favourites both point at tracks this way, and both have to
 * resolve a whole list of them at once — so the albums come back in a single
 * query rather than one per entry.
 */

/** Every album referenced by the given entries, keyed by id. */
export async function albumsFor(refs) {
  const albumIds = [...new Set(refs.map((ref) => ref.album.toString()))];
  const albums = await Album.find({ _id: { $in: albumIds } });

  return new Map(albums.map((album) => [album._id.toString(), album]));
}

/**
 * The album and track behind one entry, or null when it has gone stale — the
 * album deleted, or the track removed from it. Callers drop those rather than
 * failing the request or cleaning up behind the owner's back.
 */
export function resolveRef(byId, ref) {
  const album = byId.get(ref.album.toString());
  const track = album?.tracks.id(ref.track);

  return track ? { album, track } : null;
}

/**
 * A ceiling on one bulk request. Well past the longest album anyone is likely
 * to publish, and short of a request that would sit there resolving forever.
 */
export const MAX_BULK_TRACKS = 300;

const badRequest = (message) => Object.assign(new Error(message), { status: 400 });

/**
 * Read a bulk add request into the tracks it names.
 *
 * Two shapes, because they answer the two different asks:
 *
 *   { albumId }                       every track on that record, in playing order
 *   { items: [{ albumId, trackId }] } exactly these, in the order given
 *
 * The whole-album form exists so "add this record" does not mean shipping a
 * list of forty ids the server is about to look up anyway — and so it stays
 * correct when the album gains a track between the page loading and the click.
 *
 * Every reference is checked before anything is written: a request naming one
 * track that does not exist is a mistake worth reporting, not something to
 * half-apply. Repeats within one request are folded together, since asking for
 * the same track twice is the same as asking once.
 */
export async function expandTrackRefs(body = {}) {
  const { albumId, items } = body ?? {};

  if (items === undefined) {
    if (!albumId) {
      throw badRequest('Send an "albumId" for a whole album, or an "items" array of { albumId, trackId }');
    }

    const album = await Album.findById(albumId);
    if (!album) throw Object.assign(new Error('Album not found'), { status: 404 });

    return album.tracks.map((track) => ({ album, track }));
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw badRequest('"items" must be a non-empty array of { albumId, trackId }');
  }
  if (items.length > MAX_BULK_TRACKS) {
    throw badRequest(`Too many tracks at once: ${items.length}, the most is ${MAX_BULK_TRACKS}`);
  }
  if (items.some((item) => !item?.albumId || !item?.trackId)) {
    throw badRequest('Every item needs an albumId and a trackId');
  }

  const byId = await albumsFor(items.map((item) => ({ album: item.albumId })));

  const seen = new Set();
  const refs = [];

  for (const item of items) {
    const key = `${item.albumId}:${item.trackId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const resolved = resolveRef(byId, { album: item.albumId, track: item.trackId });
    if (!resolved) {
      throw Object.assign(new Error(`Track not found: ${item.trackId}`), { status: 404 });
    }
    refs.push(resolved);
  }

  return refs;
}
