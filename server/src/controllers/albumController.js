import Album from '../models/Album.js';
import { COVERS, TRACKS, storeUpload, removeUpload, sendUpload } from '../config/storage.js';
import { serializeAlbum, serializeTrack } from '../utils/serialize.js';
import { streamAlbumArchive, trackDownloadName } from '../services/archive.js';
import { escapeRegex } from '../utils/regex.js';

/** Load an album or throw a 404 the error handler will format. */
async function findAlbumOr404(id) {
  const album = await Album.findById(id);
  if (!album) throw Object.assign(new Error('Album not found'), { status: 404 });
  return album;
}

function findTrackOr404(album, trackId) {
  const track = album.tracks.id(trackId);
  if (!track) throw Object.assign(new Error('Track not found'), { status: 404 });
  return track;
}

/**
 * Credits arrive as a comma-separated string from the upload form and as an
 * array from a JSON edit; both mean the same list. Blanks and repeats are
 * dropped so "A, , A" does not become three credits.
 */
function parseContributingArtists(value) {
  if (value === undefined) return undefined;

  const list = Array.isArray(value) ? value : String(value).split(',');
  return [...new Set(list.map((name) => name.trim()).filter(Boolean))];
}


// GET /api/albums?q=&genre=&sort=&page=&limit=
export async function listAlbums(req, res) {
  const { q, genre, sort = '-createdAt' } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

  const filter = {};
  if (genre) filter.genre = new RegExp(`^${escapeRegex(genre)}$`, 'i');
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ title: rx }, { circle: rx }, { 'tracks.title': rx }];
  }

  const [albums, total] = await Promise.all([
    Album.find(filter)
      .sort(ALLOWED_SORTS.has(sort) ? sort : '-createdAt')
      .skip((page - 1) * limit)
      .limit(limit),
    Album.countDocuments(filter),
  ]);

  res.json({
    data: albums.map(serializeAlbum),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
  });
}

const ALLOWED_SORTS = new Set(['-createdAt', 'createdAt', 'title', '-title', 'circle', '-circle', 'year', '-year']);

// GET /api/albums/:id
export async function getAlbum(req, res) {
  const album = await findAlbumOr404(req.params.id);
  res.json(serializeAlbum(album));
}

// POST /api/albums  (multipart/form-data, optional "cover" file)
export async function createAlbum(req, res) {
  const { title, circle, year, genre, description } = req.body;

  const cover = req.file ? await storeUpload(COVERS, req.file) : null;

  try {
    const album = await Album.create({
      title,
      circle,
      year: year ? Number(year) : undefined,
      genre,
      description,
      cover,
    });
    res.status(201).json(serializeAlbum(album));
  } catch (err) {
    // Do not leave an orphaned cover in storage when validation rejects the album.
    await removeUpload(COVERS, cover);
    throw err;
  }
}

// PUT /api/albums/:id  (multipart/form-data, optional replacement "cover",
// or removeCover=true to clear the artwork without supplying a new one)
export async function updateAlbum(req, res) {
  const album = await findAlbumOr404(req.params.id);

  for (const field of ['title', 'circle', 'genre', 'description']) {
    if (req.body[field] !== undefined) album[field] = req.body[field];
  }
  if (req.body.year !== undefined) album.year = req.body.year ? Number(req.body.year) : undefined;

  // Kept as the whole record, not just the name: storage needs everything it
  // holds to delete it, and `album.cover` is about to be overwritten.
  const previousCover = album.cover?.toObject();

  // Replacing and clearing are different intents, and a form cannot express
  // "no file" as a value — an untouched file input just sends nothing, which
  // has to keep meaning "leave the cover alone".
  const clearingCover = !req.file && req.body.removeCover === 'true';

  if (req.file) album.cover = await storeUpload(COVERS, req.file);
  else if (clearingCover) album.cover = null;

  try {
    await album.save();
  } catch (err) {
    if (req.file) await removeUpload(COVERS, album.cover);
    throw err;
  }

  if (previousCover && (req.file || clearingCover)) {
    await removeUpload(COVERS, previousCover);
  }
  res.json(serializeAlbum(album));
}

// DELETE /api/albums/:id
export async function deleteAlbum(req, res) {
  const album = await findAlbumOr404(req.params.id);

  await Album.deleteOne({ _id: album._id });

  // Files go after the document: a stale file is recoverable, a document
  // pointing at a deleted file is not.
  await removeUpload(COVERS, album.cover);
  await Promise.all(album.tracks.map((t) => removeUpload(TRACKS, t.audio)));

  res.status(204).end();
}

// GET /api/albums/:id/cover
export async function getCover(req, res) {
  const album = await findAlbumOr404(req.params.id);
  if (!album.cover) throw Object.assign(new Error('Album has no cover'), { status: 404 });

  res.type(album.cover.mimeType);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  await sendUpload(res, COVERS, album.cover);
}

// POST /api/albums/:id/tracks  (multipart/form-data, required "audio" file)
export async function addTrack(req, res) {
  const album = await findAlbumOr404(req.params.id);

  if (!req.file) throw Object.assign(new Error('An "audio" file is required'), { status: 400 });

  const { title, trackNumber, duration } = req.body;
  const audio = await storeUpload(TRACKS, req.file);

  album.tracks.push({
    title,
    // Default to appending at the end of the album.
    trackNumber: trackNumber ? Number(trackNumber) : album.tracks.length + 1,
    contributingArtists: parseContributingArtists(req.body.contributingArtists) ?? [],
    duration: duration ? Number(duration) : 0,
    audio,
  });

  try {
    await album.save();
  } catch (err) {
    await removeUpload(TRACKS, audio);
    throw err;
  }

  const created = album.tracks.find((t) => t.audio.fileName === audio.fileName);
  res.status(201).json(serializeTrack(created.toJSON(), album));
}

// PUT /api/albums/:id/tracks/:trackId  (metadata only)
export async function updateTrack(req, res) {
  const album = await findAlbumOr404(req.params.id);
  const track = findTrackOr404(album, req.params.trackId);

  if (req.body.title !== undefined) track.title = req.body.title;
  for (const field of ['trackNumber', 'duration']) {
    if (req.body[field] !== undefined) track[field] = Number(req.body[field]);
  }

  const credits = parseContributingArtists(req.body.contributingArtists);
  if (credits !== undefined) track.contributingArtists = credits;

  await album.save();
  res.json(serializeTrack(album.tracks.id(track._id).toJSON(), album));
}

// DELETE /api/albums/:id/tracks/:trackId
export async function deleteTrack(req, res) {
  const album = await findAlbumOr404(req.params.id);
  const track = findTrackOr404(album, req.params.trackId);
  const audio = track.audio.toObject();

  track.deleteOne();
  await album.save();
  await removeUpload(TRACKS, audio);

  res.status(204).end();
}

// GET /api/albums/:id/tracks/:trackId/stream
// Range requests are honoured either way — by Express on disk, by the CDN the
// response redirects to on blob — so the browser can seek within a track.
export async function streamTrack(req, res) {
  const album = await findAlbumOr404(req.params.id);
  const track = findTrackOr404(album, req.params.trackId);

  res.type(track.audio.mimeType);
  await sendUpload(res, TRACKS, track.audio);
}

// GET /api/albums/:id/tracks/:trackId/download
export async function downloadTrack(req, res) {
  const album = await findAlbumOr404(req.params.id);
  const track = findTrackOr404(album, req.params.trackId);

  await sendUpload(res, TRACKS, track.audio, trackDownloadName(album, track));
}

// GET /api/albums/:id/download  — every track, zipped on the fly
export async function downloadAlbum(req, res) {
  const album = await findAlbumOr404(req.params.id);

  await streamAlbumArchive(album, res);
}
