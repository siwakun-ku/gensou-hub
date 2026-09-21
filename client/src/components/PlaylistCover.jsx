import CoverArt from './CoverArt.jsx';

/** The most tiles a mosaic is ever built from. */
const MAX_TILES = 4;

/**
 * How the tiles are laid out for each number of albums.
 *
 * Every count gets an arrangement that fills the square exactly, so a mosaic
 * never has a hole in it: two split it down the middle, three give the first
 * album the tall half and stack the other two beside it, four take a quarter
 * each.
 */
const LAYOUTS = {
  2: { grid: 'grid-cols-2 grid-rows-1', tiles: ['', ''] },
  3: { grid: 'grid-cols-2 grid-rows-2', tiles: ['row-span-2', '', ''] },
  4: { grid: 'grid-cols-2 grid-rows-2', tiles: ['', '', '', ''] },
};

/**
 * The distinct albums a playlist draws from, in the order it first reaches
 * them.
 *
 * Distinct by album, because a playlist is very often several tracks off the
 * same record and a mosaic of four identical covers says less than one cover
 * does. Tracks whose album has no artwork are skipped rather than contributing
 * a blank tile.
 */
function coverSources(tracks = []) {
  const seen = new Set();
  const albums = [];

  for (const track of tracks) {
    if (!track.coverUrl || seen.has(track.albumId)) continue;
    seen.add(track.albumId);
    albums.push({ coverUrl: track.coverUrl, title: track.albumTitle });
    if (albums.length === MAX_TILES) break;
  }

  return albums;
}

/**
 * A playlist's artwork, built from the albums inside it.
 *
 * A playlist has no cover of its own, so it borrows from what is in it: one
 * album's art when everything came off the same record, and a mosaic of up to
 * four as soon as it draws on more than one. Showing several is the point —
 * the cover is how a playlist is told apart at a glance, and the mix of records
 * is what there is to tell apart.
 *
 * Tiles are never padded to force a layout: a two-album playlist gets a
 * two-tile cover, not a four-tile one with half of it empty or repeated.
 */
export default function PlaylistCover({ playlist, className = '' }) {
  const albums = coverSources(playlist.tracks);

  if (albums.length === 0) {
    return (
      <div
        className={`flex items-center justify-center bg-gradient-to-br from-slate-300 to-slate-500 text-white ${className}`}
        aria-hidden="true"
      >
        <NotesIcon />
      </div>
    );
  }

  // Everything off one record: that record's cover, undivided. The caller's own
  // sizing is passed straight through, so there are never two competing size
  // utilities on one element.
  if (albums.length === 1) {
    return <CoverArt album={albums[0]} className={className} />;
  }

  const layout = LAYOUTS[albums.length];

  return (
    <div className={`grid ${layout.grid} overflow-hidden ${className}`} aria-hidden="true">
      {albums.map((album, index) => (
        <CoverArt
          key={album.coverUrl}
          album={album}
          className={`size-full ${layout.tiles[index]}`}
        />
      ))}
    </div>
  );
}

/** Stands in for a playlist with nothing in it, or nothing with artwork. */
function NotesIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-1/2 opacity-80"
    >
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
}
