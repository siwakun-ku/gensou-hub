import Album from '../models/Album.js';
import { serializeTrack } from '../utils/serialize.js';
import { escapeRegex } from '../utils/regex.js';

/**
 * GET /api/tracks?q=&page=&limit=  — search the library one track at a time.
 *
 * The album search answers "which records match this?"; this answers "which
 * songs match this?", which is a different question and cannot be served by
 * filtering albums: an album matching on one track would drag in all the
 * others, and a track would have no way to say why it was returned.
 */
export async function searchTracks(req, res) {
  const query = (req.query.q ?? '').trim();
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

  // No term means no results rather than the whole library: this endpoint
  // exists to answer a search, and there is nothing here to browse.
  if (!query) {
    return res.json({ data: [], pagination: { page, limit, total: 0, pages: 1 } });
  }

  const rx = new RegExp(escapeRegex(query), 'i');

  // $unwind turns each embedded track into its own document, so the match and
  // the paging both count tracks rather than albums.
  const [result] = await Album.aggregate([
    { $unwind: '$tracks' },
    {
      $match: {
        $or: [
          { 'tracks.title': rx },
          { 'tracks.contributingArtists': rx },
          // An album's own title and circle are part of how a track is
          // named, so searching for either should turn up its tracks.
          { title: rx },
          { circle: rx },
        ],
      },
    },
    { $sort: { circle: 1, title: 1, 'tracks.trackNumber': 1 } },
    {
      // One pass over the matches yields both the page and the count.
      $facet: {
        data: [{ $skip: (page - 1) * limit }, { $limit: limit }],
        total: [{ $count: 'value' }],
      },
    },
  ]);

  const total = result.total[0]?.value ?? 0;

  res.json({
    // Each row is an album document carrying exactly one of its tracks, which
    // is the shape serializeTrack already expects.
    data: result.data.map((row) => serializeTrack(row.tracks, row)),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
  });
}
