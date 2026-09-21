import AlbumCard from './AlbumCard.jsx';

/** Seconds each album spends crossing the row, whatever the selection size. */
const SECONDS_PER_ALBUM = 7;

/**
 * A slow drift through a handful of the library.
 *
 * This is a look at what is here, not a way to find something — the search page
 * does that — so it moves on its own and never asks to be paged. It stops while
 * the pointer is over it or focus is inside it, so a card can be read and
 * clicked without chasing it across the screen.
 */
export default function AlbumOverview({ albums }) {
  if (albums.length === 0) return null;

  // Constant speed regardless of how many albums are on the row, so a small
  // library does not whip past and a large one does not crawl.
  const duration = albums.length * SECONDS_PER_ALBUM;

  return (
    <div className="album-marquee-viewport relative overflow-hidden">
      <div className="album-marquee flex w-max" style={{ '--marquee-ms': `${duration}s` }}>
        {/* The same albums twice: the first copy is the row, the second is what
            is already in place when the loop comes round. */}
        {[0, 1].map((copy) => (
          <div key={copy} className="flex" aria-hidden={copy === 1}>
            {albums.map((album) => (
              <div key={album.id} className="w-44 shrink-0 pr-4 sm:w-52">
                {/* The clone is decoration; only the real row is reachable. */}
                <AlbumCard album={album} tabIndex={copy === 1 ? -1 : undefined} />
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* The row runs to the edges rather than stopping dead, so it reads as a
          window onto something longer. */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-canvas to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-canvas to-transparent" />
    </div>
  );
}
