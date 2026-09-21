import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AlbumCard from '../components/AlbumCard.jsx';
import CircleLogo from '../components/CircleLogo.jsx';
import { ErrorMessage } from '../components/FormControls.jsx';
import { yearSpan } from './Circles.jsx';
import { circlesApi } from '../lib/api.js';
import { circlePath } from '../lib/paths.js';
import { useAuth } from '../lib/AuthContext.jsx';

export default function CircleDetail() {
  // The name in the path is the identifier; React Router hands it back decoded.
  const { name } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const [circle, setCircle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    circlesApi
      .get(name)
      .then((data) => !cancelled && setCircle(data))
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [name]);

  /**
   * Deleting the profile is not deleting the circle: the albums keep crediting
   * it, so the page stays — it simply has nothing written on it again. Saying
   * that in the prompt is the difference between a tidy-up and a scare.
   */
  async function handleDelete() {
    if (
      !window.confirm(
        `Delete what is written about ${circle.name}? Their ${circle.albumCount} album(s) stay in the library.`
      )
    )
      return;

    try {
      await circlesApi.remove(circle.id);
      setCircle(await circlesApi.get(circle.name));
    } catch (err) {
      // A circle with no albums stops existing entirely once its profile goes,
      // so there is no page left to return to.
      if (err.message === 'Circle not found') navigate('/circles');
      else setError(err.message);
    }
  }

  if (loading) return <p className="text-slate-500">Loading circle…</p>;

  if (!circle) {
    return (
      <div className="space-y-3">
        <ErrorMessage>{error ?? 'Circle not found'}</ErrorMessage>
        <Link to="/circles" className="text-brand-600 underline">
          Back to circles
        </Link>
      </div>
    );
  }

  const facts = [
    circle.origin,
    circle.foundedYear && `Founded ${circle.foundedYear}`,
    `${circle.albumCount} ${circle.albumCount === 1 ? 'album' : 'albums'}`,
    circle.trackCount > 0 && `${circle.trackCount} tracks`,
    yearSpan(circle) && `Releases ${yearSpan(circle)}`,
  ].filter(Boolean);

  return (
    <section className="space-y-8">
      <header className="flex flex-col gap-6 sm:flex-row">
        <CircleLogo circle={circle} className="aspect-square w-full rounded-xl sm:w-44" />

        <div className="flex flex-1 flex-col justify-end gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Circle</p>
            <h1 className="text-3xl font-bold">{circle.name}</h1>
          </div>

          <p className="text-sm text-slate-500">{facts.join(' · ')}</p>

          {circle.description ? (
            <p className="whitespace-pre-line text-slate-600">{circle.description}</p>
          ) : (
            <p className="text-sm italic text-slate-400">
              Nothing is written about this circle yet — the library knows them only from the
              albums crediting them.
            </p>
          )}

          {circle.links.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {circle.links.map((link) => (
                <li key={`${link.label}-${link.url}`}>
                  {/* Somebody else's site: opened away from the app, and told
                      not to hand it a handle back to this window. */}
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1 text-sm text-slate-600 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 dark:hover:text-brand-300"
                  >
                    {link.label}
                    <ExternalIcon />
                  </a>
                </li>
              ))}
            </ul>
          )}

          {isAdmin && (
            <div className="flex flex-wrap gap-2">
              {circle.hasProfile ? (
                <>
                  <Link
                    to={`${circlePath(circle.name)}/edit`}
                    className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 dark:hover:text-brand-300"
                  >
                    Edit circle
                  </Link>
                  <button
                    onClick={handleDelete}
                    className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-red-300 hover:bg-red-50 hover:text-red-600"
                  >
                    Delete profile
                  </button>
                </>
              ) : (
                /* The name is carried across so the form opens already
                   pointing at this circle rather than at a blank one that
                   happens to need the same name typed identically. */
                <Link
                  to={`/admin/circles/new?name=${encodeURIComponent(circle.name)}`}
                  className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
                >
                  Write a profile
                </Link>
              )}
            </div>
          )}
        </div>
      </header>

      <ErrorMessage>{error}</ErrorMessage>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Discography</h2>

        {circle.albums.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-500">
            Nothing of theirs is in the library yet.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {circle.albums.map((album) => (
              <AlbumCard key={album.id} album={album} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ExternalIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-3.5"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" />
    </svg>
  );
}
