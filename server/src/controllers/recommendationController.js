import Album from '../models/Album.js';
import RecommendationSetting, { RECOMMENDATION_MODES } from '../models/RecommendationSetting.js';
import { serializeTrack } from '../utils/serialize.js';

/** Hand-picked tracks, in the admin's chosen order. */
async function resolveFixed(settings) {
  if (settings.picks.length === 0) return [];

  const albumIds = [...new Set(settings.picks.map((pick) => pick.album.toString()))];
  const albums = await Album.find({ _id: { $in: albumIds } });
  const byId = new Map(albums.map((album) => [album._id.toString(), album]));

  return settings.picks
    .map((pick) => {
      // A pick can go stale: the album or the track may have been deleted since
      // it was chosen. Drop it rather than failing the whole section.
      const album = byId.get(pick.album.toString());
      const track = album?.tracks.id(pick.track);
      if (!track) return null;

      return serializeTrack(track.toJSON(), album);
    })
    .filter(Boolean)
    .slice(0, settings.limit);
}

/** A fresh random selection on every request. */
async function resolveRandom(settings) {
  // $unwind turns each embedded track into its own document so $sample can
  // pick across every track in the library, not just whole albums.
  const rows = await Album.aggregate([
    { $match: { 'tracks.0': { $exists: true } } },
    { $unwind: '$tracks' },
    { $sample: { size: settings.limit } },
  ]);

  return rows.map((row) => serializeTrack(row.tracks, row));
}

// GET /api/recommendations  — what the home page shows
export async function listRecommendations(req, res) {
  const settings = await RecommendationSetting.load();

  const items =
    settings.mode === 'fixed' ? await resolveFixed(settings) : await resolveRandom(settings);

  res.json({ mode: settings.mode, limit: settings.limit, items });
}

// GET /api/recommendations/settings  — admin view of the configuration
export async function getSettings(req, res) {
  const settings = await RecommendationSetting.load();

  res.json({
    mode: settings.mode,
    limit: settings.limit,
    picks: settings.picks.map((pick) => ({
      albumId: pick.album.toString(),
      trackId: pick.track.toString(),
    })),
  });
}

/** Every pick must point at a track that actually exists. */
async function validatePicks(picks) {
  if (!Array.isArray(picks)) {
    throw Object.assign(new Error('picks must be an array'), { status: 400 });
  }

  const normalised = [];

  for (const pick of picks) {
    const albumId = pick?.albumId;
    const trackId = pick?.trackId;

    if (!albumId || !trackId) {
      throw Object.assign(new Error('Each pick needs an albumId and a trackId'), { status: 400 });
    }

    const album = await Album.findById(albumId);
    if (!album?.tracks.id(trackId)) {
      throw Object.assign(new Error(`No such track: ${albumId}/${trackId}`), { status: 404 });
    }

    normalised.push({ album: albumId, track: trackId });
  }

  return normalised;
}

// PUT /api/recommendations/settings
export async function updateSettings(req, res) {
  const settings = await RecommendationSetting.load();
  const { mode, limit, picks } = req.body;

  if (mode !== undefined) {
    if (!RECOMMENDATION_MODES.includes(mode)) {
      throw Object.assign(
        new Error(`mode must be one of: ${RECOMMENDATION_MODES.join(', ')}`),
        { status: 400 }
      );
    }
    settings.mode = mode;
  }

  if (limit !== undefined) settings.limit = Number(limit);

  // Picks are kept when switching to random, so the selection survives a toggle.
  if (picks !== undefined) settings.picks = await validatePicks(picks);

  await settings.save();

  res.json({
    mode: settings.mode,
    limit: settings.limit,
    picks: settings.picks.map((pick) => ({
      albumId: pick.album.toString(),
      trackId: pick.track.toString(),
    })),
  });
}
