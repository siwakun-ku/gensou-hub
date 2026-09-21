import Album from '../models/Album.js';
import Circle, { circleKey } from '../models/Circle.js';
import { CIRCLES, storeUpload, removeUpload, sendUpload } from '../config/storage.js';
import { serializeAlbum, serializeCircle } from '../utils/serialize.js';
import { escapeRegex } from '../utils/regex.js';

async function findOr404(id) {
  const circle = await Circle.findById(id);
  if (!circle) throw Object.assign(new Error('Circle not found'), { status: 404 });
  return circle;
}


/**
 * Links arrive as JSON from a multipart form and as an array from a JSON body;
 * both mean the same list. Entries missing either half are dropped rather than
 * saved as a label pointing nowhere.
 */
function parseLinks(value) {
  if (value === undefined) return undefined;

  let list = value;
  if (typeof value === 'string') {
    if (value.trim() === '') return [];
    try {
      list = JSON.parse(value);
    } catch {
      throw Object.assign(new Error('links must be a JSON array of { label, url }'), {
        status: 400,
      });
    }
  }

  if (!Array.isArray(list)) {
    throw Object.assign(new Error('links must be an array of { label, url }'), { status: 400 });
  }

  return list
    .map((link) => ({ label: String(link?.label ?? '').trim(), url: String(link?.url ?? '').trim() }))
    .filter((link) => link.label && link.url);
}

/** Match an album's free-text circle field against one exact name. */
const nameMatcher = (name) => new RegExp(`^\\s*${escapeRegex(String(name).trim())}\\s*$`, 'i');

/**
 * What the albums themselves say about each circle, keyed the same way the
 * profiles are.
 *
 * Grouped on the folded name so releases spelled "Gensou Sound" and "GENSOU
 * SOUND" count as one group rather than two entries sitting next to each other
 * in the directory.
 */
async function albumStats(key = null) {
  const rows = await Album.aggregate([
    {
      $group: {
        _id: { $toLower: { $trim: { input: '$circle' } } },
        // A spelling to show when no profile has settled on one.
        name: { $first: '$circle' },
        albumCount: { $sum: 1 },
        trackCount: { $sum: { $size: { $ifNull: ['$tracks', []] } } },
        firstYear: { $min: '$year' },
        latestYear: { $max: '$year' },
      },
    },
    ...(key ? [{ $match: { _id: key } }] : []),
  ]);

  return new Map(rows.map((row) => [row._id, { ...row, name: String(row.name).trim() }]));
}

/**
 * GET /api/circles?q=&sort=
 *
 * Every circle the library knows about, whether or not anyone has written it
 * up. A group is real to a listener the moment an album credits it, so leaving
 * the unwritten ones out would make the directory disagree with the shelves.
 */
export async function listCircles(req, res) {
  const { q, sort = 'name' } = req.query;

  const [profiles, stats] = await Promise.all([Circle.find(), albumStats()]);

  const byKey = new Map();

  for (const profile of profiles) {
    byKey.set(profile.key, serializeCircle(profile, stats.get(profile.key)));
  }

  for (const [key, row] of stats) {
    if (!byKey.has(key)) byKey.set(key, serializeCircle(null, row));
  }

  let circles = [...byKey.values()];

  if (q?.trim()) {
    const rx = new RegExp(escapeRegex(q.trim()), 'i');
    circles = circles.filter((circle) => rx.test(circle.name) || rx.test(circle.description));
  }

  // Alphabetical by default: a directory is for finding a name you already
  // have in mind. Sorting by catalogue size answers a different question, so it
  // is offered rather than assumed.
  circles.sort((a, b) =>
    sort === 'albums'
      ? b.albumCount - a.albumCount || a.name.localeCompare(b.name)
      : a.name.localeCompare(b.name)
  );

  res.json({ data: circles, total: circles.length });
}

/**
 * GET /api/circles/lookup?name=
 *
 * A circle is addressed by name rather than by id, because the name is the only
 * thing an album carries and half of these have no document to have an id. The
 * name travels in the query string, not the path, so a circle with a slash in
 * its name is still reachable.
 */
export async function lookupCircle(req, res) {
  const { name } = req.query;
  if (!name?.trim()) {
    throw Object.assign(new Error('A "name" is required'), { status: 400 });
  }

  const key = circleKey(name);

  const [profile, stats, albums] = await Promise.all([
    Circle.findOne({ key }),
    albumStats(key),
    Album.find({ circle: nameMatcher(name) }).sort({ year: -1, title: 1 }),
  ]);

  // Neither written up nor credited on anything: there is no such circle.
  if (!profile && albums.length === 0) {
    throw Object.assign(new Error('Circle not found'), { status: 404 });
  }

  res.json({
    ...serializeCircle(profile, stats.get(key)),
    albums: albums.map(serializeAlbum),
  });
}

/**
 * Refuse a name a different profile already holds.
 *
 * The unique index is the real guarantee, but it fires as a database error
 * after the write is attempted and it is built in the background, so it cannot
 * be the thing that answers the caller. This checks first and says what
 * happened; the index stays underneath to catch two admins racing.
 */
async function assertNameFree(name, exceptId = null) {
  if (!name?.trim()) return;

  const clash = await Circle.findOne({ key: circleKey(name) });
  if (clash && String(clash._id) !== String(exceptId)) {
    throw Object.assign(new Error(`There is already a profile for "${clash.name}"`), {
      status: 409,
    });
  }
}

// POST /api/circles  (multipart/form-data, optional "logo" file)
export async function createCircle(req, res) {
  const { name, origin, foundedYear, description } = req.body;

  const logo = req.file ? await storeUpload(CIRCLES, req.file) : null;

  try {
    await assertNameFree(name);

    const circle = await Circle.create({
      name,
      origin,
      foundedYear: foundedYear ? Number(foundedYear) : undefined,
      description,
      links: parseLinks(req.body.links) ?? [],
      logo,
    });

    // Written up after the fact, the profile picks up the albums already
    // crediting it — no linking step, because the name was always the link.
    const stats = await albumStats(circle.key);
    res.status(201).json(serializeCircle(circle, stats.get(circle.key)));
  } catch (err) {
    await removeUpload(CIRCLES, logo);
    throw duplicateAsConflict(err, name);
  }
}

/**
 * PUT /api/circles/:id  (multipart/form-data, optional replacement "logo",
 * or removeLogo=true to clear it)
 *
 * Renaming is the one edit that reaches outside this document: albums name
 * their circle in text, so a rename that touched only the profile would leave
 * every album pointing at the old name and the profile attached to nothing.
 * They move together.
 */
export async function updateCircle(req, res) {
  const circle = await findOr404(req.params.id);
  const previousName = circle.name;

  await assertNameFree(req.body.name, circle._id);

  for (const field of ['name', 'origin', 'description']) {
    if (req.body[field] !== undefined) circle[field] = req.body[field];
  }
  if (req.body.foundedYear !== undefined) {
    circle.foundedYear = req.body.foundedYear ? Number(req.body.foundedYear) : undefined;
  }

  const links = parseLinks(req.body.links);
  if (links !== undefined) circle.links = links;

  // The whole record, not just the name: storage needs everything it holds to
  // delete it, and `circle.logo` is about to be overwritten.
  const previousLogo = circle.logo?.toObject();
  const clearingLogo = !req.file && req.body.removeLogo === 'true';

  if (req.file) circle.logo = await storeUpload(CIRCLES, req.file);
  else if (clearingLogo) circle.logo = null;

  try {
    await circle.save();
  } catch (err) {
    if (req.file) await removeUpload(CIRCLES, circle.logo);
    throw duplicateAsConflict(err, circle.name);
  }

  if (previousLogo && (req.file || clearingLogo)) {
    await removeUpload(CIRCLES, previousLogo);
  }

  let albumsRenamed = 0;
  if (circle.name !== previousName) {
    const result = await Album.updateMany(
      { circle: nameMatcher(previousName) },
      { $set: { circle: circle.name } }
    );
    albumsRenamed = result.modifiedCount ?? 0;
  }

  const stats = await albumStats(circle.key);
  res.json({ ...serializeCircle(circle, stats.get(circle.key)), albumsRenamed });
}

/**
 * DELETE /api/circles/:id
 *
 * Removes what was written about the circle, never the music. The albums keep
 * crediting it by name, so it stays in the directory as an unwritten entry —
 * deleting a profile is forgetting a biography, not disowning a discography.
 */
export async function deleteCircle(req, res) {
  const circle = await findOr404(req.params.id);

  await Circle.deleteOne({ _id: circle._id });
  await removeUpload(CIRCLES, circle.logo);

  res.status(204).end();
}

// GET /api/circles/:id/logo
export async function getCircleLogo(req, res) {
  const circle = await findOr404(req.params.id);
  if (!circle.logo) throw Object.assign(new Error('Circle has no logo'), { status: 404 });

  res.type(circle.logo.mimeType);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  await sendUpload(res, CIRCLES, circle.logo);
}

/**
 * The unique index is what actually stops two profiles claiming one group, but
 * its error reads like a database fault. Say what happened instead.
 */
function duplicateAsConflict(err, name) {
  if (err?.code !== 11000) return err;

  return Object.assign(new Error(`There is already a profile for "${String(name).trim()}"`), {
    status: 409,
  });
}
