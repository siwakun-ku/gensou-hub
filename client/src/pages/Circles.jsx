import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import CircleLogo from '../components/CircleLogo.jsx';
import { ErrorMessage } from '../components/FormControls.jsx';
import { circlesApi } from '../lib/api.js';
import { circlePath } from '../lib/paths.js';
import { useAuth } from '../lib/AuthContext.jsx';

const SORTS = [
  { value: 'name', label: 'A–Z' },
  { value: 'albums', label: 'Most albums' },
];

/**
 * Which letter a circle files under.
 *
 * Anything not starting with a Latin letter — a number, or a name written in
 * Japanese, which plenty are — goes under "#" rather than getting a heading of
 * its own, so the index stays a short row of letters instead of one bucket per
 * kanji.
 */
function initial(name) {
  const first = String(name ?? '').trim()[0]?.toUpperCase() ?? '#';
  return /[A-Z]/.test(first) ? first : '#';
}

export default function Circles() {
  const { isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const query = searchParams.get('q') ?? '';
  const sort = SORTS.some((s) => s.value === searchParams.get('sort'))
    ? searchParams.get('sort')
    : 'name';
  const profiledOnly = searchParams.get('profiled') === 'true';

  const [circles, setCircles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    // Debounced so typing does not fire a request per keystroke.
    const timer = setTimeout(() => {
      circlesApi
        .list({ ...(query.trim() ? { q: query.trim() } : {}), sort })
        .then((result) => {
          if (cancelled) return;
          setCircles(result.data);
          setError(null);
        })
        .catch((err) => !cancelled && setError(err.message))
        .finally(() => !cancelled && setLoading(false));
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, sort]);

  // The filter lives in the URL, so a view of the directory is a link.
  function updateSearch(changes) {
    const next = { q: query, sort, profiled: String(profiledOnly), ...changes };

    // Defaults are left out so a plain browse stays a tidy /circles.
    const params = {};
    if (next.q) params.q = next.q;
    if (next.sort !== 'name') params.sort = next.sort;
    if (next.profiled === 'true') params.profiled = 'true';

    setSearchParams(params, { replace: true });
  }

  /*
   * Narrowing to written-up circles is done here rather than by the server:
   * the list is the whole directory either way, and doing it in the browser
   * keeps the toggle instant instead of costing a round trip to hide rows that
   * are already in hand.
   */
  const shown = useMemo(
    () => (profiledOnly ? circles.filter((circle) => circle.hasProfile) : circles),
    [circles, profiledOnly]
  );

  const unwritten = circles.filter((circle) => !circle.hasProfile).length;
  const searching = Boolean(query.trim());

  // Letters only earn headings when the list is actually in letter order and
  // long enough to need finding your way around.
  const grouped = sort === 'name' && !searching && shown.length > 8;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Circles</h1>
          <p className="mt-1 text-sm text-slate-500">
            The groups behind the records — who they are, where they are from, and everything of
            theirs the library holds.
          </p>
        </div>

        {isAdmin && (
          <Link
            to="/admin/circles/new"
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
          >
            Add circle
          </Link>
        )}
      </div>

      <div className="space-y-3">
        <div className="relative">
          <SearchIcon />
          <input
            type="search"
            value={query}
            onChange={(event) => updateSearch({ q: event.target.value })}
            placeholder="Circle name, or a word from its description…"
            aria-label="Search circles"
            className="w-full rounded-xl border border-slate-300 py-3 pl-11 pr-4 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {SORTS.map((option) => (
            <button
              key={option.value}
              onClick={() => updateSearch({ sort: option.value })}
              aria-pressed={sort === option.value}
              // Ordering means nothing while a search is ranking by relevance
              // of its own, so the choice steps aside rather than misleading.
              disabled={searching}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
                sort === option.value
                  ? 'bg-brand-600 text-white'
                  : 'border border-slate-300 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {option.label}
            </button>
          ))}

          {/* Worth offering only when there is something to hide. */}
          {unwritten > 0 && (
            <button
              onClick={() => updateSearch({ profiled: String(!profiledOnly) })}
              aria-pressed={profiledOnly}
              title="Hide circles known only from the albums crediting them"
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                profiledOnly
                  ? 'bg-brand-600 text-white'
                  : 'border border-slate-300 text-slate-600 hover:bg-slate-100'
              }`}
            >
              Written up only
            </button>
          )}
        </div>
      </div>

      <ErrorMessage>{error}</ErrorMessage>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Shaped like the cards it stands in for, so the grid does not jump
              as the real ones arrive. */}
          {[0, 1, 2, 3, 4, 5].map((key) => (
            <div
              key={key}
              className="animate-pulse overflow-hidden rounded-2xl border border-slate-200"
            >
              <div className="aspect-[4/3] w-full bg-slate-200" />
              <div className="space-y-2 p-4">
                <div className="h-4 w-2/3 rounded bg-slate-200" />
                <div className="h-3 w-1/3 rounded bg-slate-200" />
              </div>
            </div>
          ))}
        </div>
      ) : shown.length === 0 ? (
        <EmptyState query={query} profiledOnly={profiledOnly} onClear={() => updateSearch({ q: '', profiled: 'false' })} />
      ) : (
        <>
          <p className="text-sm text-slate-500">
            {shown.length} {shown.length === 1 ? 'circle' : 'circles'}
            {searching && ` matching “${query.trim()}”`}
            {!profiledOnly && unwritten > 0 && !searching && ` · ${unwritten} not written up yet`}
          </p>

          {grouped ? (
            Object.entries(
              shown.reduce((buckets, circle) => {
                const letter = initial(circle.name);
                (buckets[letter] ??= []).push(circle);
                return buckets;
              }, {})
            ).map(([letter, group]) => (
              <div key={letter} className="space-y-3">
                {/* Pinned under the app header, whose measured height the
                    layout publishes, so a letter stays visible while its own
                    stretch of the list is being read. */}
                <h2
                  className="sticky z-[1] -mx-1 bg-canvas/90 px-1 py-1 text-sm font-bold uppercase tracking-wide text-slate-400 backdrop-blur"
                  style={{ top: 'var(--header-height, 0px)' }}
                >
                  {letter}
                </h2>
                <Grid circles={group} />
              </div>
            ))
          ) : (
            <Grid circles={shown} />
          )}
        </>
      )}
    </section>
  );
}

function Grid({ circles }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {circles.map((circle) => (
        <CircleCard key={circle.name} circle={circle} />
      ))}
    </div>
  );
}

/**
 * One circle, led by its mark.
 *
 * The logo runs the full width of the card rather than sitting beside the text
 * as a thumbnail: a circle's mark is how it is recognised, and at thumbnail
 * size it was the smallest thing on a card otherwise made of words.
 */
function CircleCard({ circle }) {
  return (
    <Link
      to={circlePath(circle.name)}
      className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-surface transition hover:-translate-y-1 hover:border-brand-300 hover:shadow-xl"
    >
      {/* Wider than tall, so a card is led by its mark without the mark taking
          the whole card and pushing the words off the bottom of the grid. */}
      <div className="overflow-hidden">
        <CircleLogo
          circle={circle}
          letterClass="text-6xl"
          className="aspect-[4/3] w-full transition duration-500 group-hover:scale-105"
        />
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <h3 className="truncate text-lg font-semibold transition group-hover:text-brand-600">
          {circle.name}
        </h3>

        {circle.origin && <p className="-mt-1 truncate text-sm text-slate-500">{circle.origin}</p>}

        {/* Counts as chips rather than a run-on line: they are the one thing
            every card has, so they are what the eye compares across the grid. */}
        <div className="flex flex-wrap gap-1.5">
          <Chip>
            {circle.albumCount} {circle.albumCount === 1 ? 'album' : 'albums'}
          </Chip>
          {circle.trackCount > 0 && <Chip>{circle.trackCount} tracks</Chip>}
          {yearSpan(circle) && <Chip>{yearSpan(circle)}</Chip>}
        </div>

        {circle.description ? (
          <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-slate-500">
            {circle.description}
          </p>
        ) : (
          /* Not an error — most circles are known only by the albums crediting
             them, and saying so invites somebody to fill it in. */
          <p className="mt-1 text-xs italic text-slate-400">Nothing written about them yet.</p>
        )}
      </div>
    </Link>
  );
}

function Chip({ children }) {
  return (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
      {children}
    </span>
  );
}

function EmptyState({ query, profiledOnly, onClear }) {
  const searching = Boolean(query.trim());

  return (
    <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center">
      <p className="font-medium text-slate-600">
        {searching ? `No circle matches “${query.trim()}”` : 'No circles to show'}
      </p>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
        {profiledOnly
          ? 'None of the circles here have been written up yet. Clear the filter to see the ones the albums name.'
          : searching
            ? 'Try part of a name, or a word from what was written about them.'
            : 'A circle appears here as soon as an album credits it.'}
      </p>

      {(searching || profiledOnly) && (
        <button
          onClick={onClear}
          className="mt-4 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
        >
          Clear search and filters
        </button>
      )}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-400"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

/** "2014–2021", or just the one year when that is all there is. */
export function yearSpan({ firstYear, latestYear }) {
  if (!firstYear && !latestYear) return null;
  if (!firstYear || firstYear === latestYear) return String(latestYear ?? firstYear);
  return `${firstYear}–${latestYear}`;
}
