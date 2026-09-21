import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AlbumOverview from '../components/AlbumOverview.jsx';
import HeroSlider from '../components/HeroSlider.jsx';
import Container from '../components/Container.jsx';
import RecommendedTracks from '../components/RecommendedTracks.jsx';
import { albumsApi } from '../lib/api.js';
import { shuffled } from '../lib/shuffle.js';
import { useAuth } from '../lib/AuthContext.jsx';

// Enough to draw from for variety, without pulling the whole library down to
// show a dozen of it.
const POOL_LIMIT = 40;
const ON_SHOW = 12;

export default function Albums() {
  const { isAdmin } = useAuth();

  const [albums, setAlbums] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // The hero fetches nothing here any more: the wallpapers and the slide
  // showing are app-wide state, shared with the sign-in backdrop.

  /**
   * A different handful of the library each visit.
   *
   * This section is an overview, not a catalogue — searching and paging live on
   * the search page now. Picking at random means the same albums are not
   * permanently the face of the place, and the rest of the library gets a turn.
   */
  useEffect(() => {
    let cancelled = false;

    albumsApi
      .list({ limit: POOL_LIMIT })
      .then((result) => {
        if (cancelled) return;
        setAlbums(shuffled(result.data).slice(0, ON_SHOW));
        setTotal(result.pagination.total);
        setError(null);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <HeroSlider />

      <Container className="space-y-10">
        <RecommendedTracks />

        <section className="space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">Albums</h1>
              <p className="text-sm text-slate-500">
                {total > 0
                  ? `${total} ${total === 1 ? 'record' : 'records'} in the library — here are a few.`
                  : 'Everything in the library.'}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Link
                to="/search"
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-surface"
              >
                Browse all
              </Link>
              {isAdmin && (
                <Link
                  to="/albums/new"
                  className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
                >
                  Add album
                </Link>
              )}
            </div>
          </div>

          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          {loading ? (
            <div className="flex gap-4 overflow-hidden">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  className="w-44 shrink-0 animate-pulse rounded-xl border border-slate-200 bg-surface sm:w-52"
                >
                  <div className="aspect-square w-full bg-slate-200" />
                  <div className="space-y-2 p-3">
                    <div className="h-4 w-3/4 rounded bg-slate-200" />
                    <div className="h-3 w-1/2 rounded bg-slate-100" />
                  </div>
                </div>
              ))}
            </div>
          ) : albums.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 p-10 text-center text-slate-500">
              No albums yet — add your first one.
            </p>
          ) : (
            <AlbumOverview albums={albums} />
          )}
        </section>
      </Container>
    </>
  );
}
