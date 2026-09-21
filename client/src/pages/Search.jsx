import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AlbumCard from '../components/AlbumCard.jsx';
import CoverArt from '../components/CoverArt.jsx';
import TrackMeta from '../components/TrackMeta.jsx';
import AddToPlaylist from '../components/AddToPlaylist.jsx';
import FavouriteButton from '../components/FavouriteButton.jsx';
import { ErrorMessage } from '../components/FormControls.jsx';
import TrackBulkBar from '../components/TrackBulkBar.jsx';
import { albumsApi, tracksApi, mediaUrl } from '../lib/api.js';
import { formatDuration } from '../lib/format.js';
import { usePlayer } from '../lib/PlayerContext.jsx';
import { useAuth } from '../lib/AuthContext.jsx';
import { shuffled } from '../lib/shuffle.js';

const TYPES = [
  { value: 'albums', label: 'Albums', blurb: 'Whole records, by title or circle' },
  { value: 'tracks', label: 'Tracks', blurb: 'Individual songs, by title or credit' },
];

const PAGE_SIZE = 12;

// How much of the library the shuffled browse draws from. The whole list is
// fetched so the shuffle covers everything rather than reordering one page,
// and so paging through it stays stable; this is the ceiling on that.
const BROWSE_LIMIT = 100;

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';
  // An unrecognised type in the URL falls back rather than showing nothing.
  const type = TYPES.some((t) => t.value === searchParams.get('type'))
    ? searchParams.get('type')
    : 'albums';
  const page = Number(searchParams.get('page')) || 1;

  const [results, setResults] = useState([]);
  const [pagination, setPagination] = useState(null);
  // The whole library in a random order, held so paging does not reshuffle it.
  const [browsePool, setBrowsePool] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const hasQuery = Boolean(query.trim());
  // With no keyword the album search falls back to browsing the whole library,
  // which is a sensible thing to show. A track search has no such default: the
  // every-track-we-have list is not a useful page.
  const browsingAlbums = !hasQuery && type === 'albums';

  /**
   * Browsing with no keyword: the library in no particular order.
   *
   * Nothing about "most recently added" makes it the right thing to meet, so
   * the order is deliberately arbitrary — a different corner of the collection
   * each visit. Drawn once per visit rather than per page, so paging walks a
   * settled order instead of dealing a new hand every click.
   */
  useEffect(() => {
    if (!browsingAlbums) {
      setBrowsePool(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    albumsApi
      .list({ page: 1, limit: BROWSE_LIMIT })
      .then((result) => {
        if (cancelled) return;
        setBrowsePool(shuffled(result.data));
        setError(null);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [browsingAlbums]);

  useEffect(() => {
    if (!hasQuery) {
      setResults([]);
      setPagination(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    // Debounced, so typing does not fire a request per keystroke.
    const timer = setTimeout(() => {
      const request =
        type === 'tracks'
          ? tracksApi.search({ q: query, page, limit: PAGE_SIZE })
          : albumsApi.list({ q: query, page, limit: PAGE_SIZE });

      request
        .then((result) => {
          if (cancelled) return;
          setResults(result.data);
          setPagination(result.pagination);
          setError(null);
        })
        .catch((err) => !cancelled && setError(err.message))
        .finally(() => !cancelled && setLoading(false));
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, type, page, hasQuery]);

  // The browse list is paged here rather than by the server, since the order it
  // is being shown in only exists on this page.
  const items = browsingAlbums
    ? (browsePool ?? []).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    : results;
  const total = browsingAlbums ? (browsePool?.length ?? 0) : (pagination?.total ?? 0);
  const pages = browsingAlbums ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : (pagination?.pages ?? 1);

  /**
   * The search lives in the URL, so a result is a link someone can keep. Any
   * change but paging starts again from the first page — page 3 of the old
   * search says nothing about the new one.
   */
  function updateSearch(changes) {
    const next = { q: query, type, page: String(page), ...changes };
    if (!('page' in changes)) next.page = '1';

    // Defaults are left out so a plain search stays a tidy ?q=.
    const params = {};
    if (next.q) params.q = next.q;
    if (next.type !== 'albums') params.type = next.type;
    if (Number(next.page) > 1) params.page = next.page;

    setSearchParams(params, { replace: true });
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Search</h1>
        <p className="text-sm text-slate-500">
          Look for a record, or for one song wherever it happens to live.
        </p>
      </div>

      <div className="space-y-3">
        <input
          type="search"
          value={query}
          onChange={(event) => updateSearch({ q: event.target.value })}
          placeholder={type === 'tracks' ? 'Song title, circle or credit…' : 'Album title or circle…'}
          autoFocus
          className="w-full rounded-md border border-slate-300 px-4 py-2.5 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
        />

        {/* The two searches answer different questions, so which one is running
            is a visible choice rather than something inferred from the words. */}
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="What to search">
          {TYPES.map((option) => (
            <button
              key={option.value}
              role="tab"
              aria-selected={type === option.value}
              onClick={() => updateSearch({ type: option.value })}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                type === option.value
                  ? 'bg-brand-600 text-white'
                  : 'border border-slate-300 text-slate-600 hover:bg-slate-100'
              }`}
              title={option.blurb}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <ErrorMessage>{error}</ErrorMessage>

      {!hasQuery && !browsingAlbums ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-500">
          {TYPES.find((t) => t.value === type).blurb}.
        </p>
      ) : loading ? (
        <p className="text-slate-500">{hasQuery ? 'Searching…' : 'Loading albums…'}</p>
      ) : items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-500">
          {hasQuery ? (
            <>
              Nothing matches “{query}”. Try the {type === 'tracks' ? 'Albums' : 'Tracks'} search
              instead?
            </>
          ) : (
            'There are no albums in the library yet.'
          )}
        </p>
      ) : (
        <>
          <p className="text-sm text-slate-500">
            {hasQuery
              ? `${total} ${total === 1 ? 'result' : 'results'}`
              : `${total} ${total === 1 ? 'album' : 'albums'}, shuffled`}
          </p>

          {type === 'albums' ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {items.map((album) => (
                <AlbumCard key={album.id} album={album} />
              ))}
            </div>
          ) : (
            <TrackResults tracks={items} query={query} />
          )}

          {pages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <PageButton
                disabled={page <= 1}
                onClick={() => updateSearch({ page: String(page - 1) })}
              >
                Previous
              </PageButton>
              <span className="text-sm text-slate-500">
                Page {page} of {pages}
              </span>
              <PageButton
                disabled={page >= pages}
                onClick={() => updateSearch({ page: String(page + 1) })}
              >
                Next
              </PageButton>
            </div>
          )}
        </>
      )}
    </section>
  );
}

/**
 * Matching tracks, playable straight from the results.
 *
 * The results are the queue, so skip walks the search rather than dead-ending
 * on whichever track was clicked.
 */
function TrackResults({ tracks, query }) {
  const { current, isPlaying, play } = usePlayer();
  const { isAuthenticated } = useAuth();
  const queue = { id: `search:${query}`, title: `Search: ${query}`, tracks };

  // Which results the bulk actions apply to. Empty means "everything found".
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  /*
   * A new set of results is a new set of things to tick. Carrying a selection
   * across a search would leave tracks marked that are no longer on the page,
   * and the bar counting rows nobody can see.
   */
  useEffect(() => setSelectedIds(new Set()), [tracks]);

  const toggleSelect = (trackId) =>
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(trackId)) next.delete(trackId);
      else next.add(trackId);
      return next;
    });

  return (
    <div className="space-y-3">
      {/* No albumId: these results come from across the library, so the batch
          names its tracks one by one and may span any number of records. */}
      <TrackBulkBar
        tracks={tracks}
        selectedIds={selectedIds}
        onSelectAll={() => setSelectedIds(new Set(tracks.map((track) => track.id)))}
        onClear={() => setSelectedIds(new Set())}
      />

      <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-surface">
      {tracks.map((track) => {
        const isCurrent = current?.track.id === track.id;
        const selected = selectedIds.has(track.id);

        return (
          <li
            key={track.id}
            className={`flex items-center gap-3 px-4 py-3 transition ${
              isCurrent ? 'bg-brand-50' : selected ? 'bg-brand-50/50' : 'hover:bg-slate-50'
            }`}
          >
            {isAuthenticated && (
              <input
                type="checkbox"
                checked={selected}
                onChange={() => toggleSelect(track.id)}
                aria-label={`Select ${track.title}`}
                className="size-4 shrink-0 accent-brand-600"
              />
            )}

            <button
              onClick={() => play(track, queue)}
              aria-label={isCurrent && isPlaying ? `Pause ${track.title}` : `Play ${track.title}`}
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white transition hover:bg-brand-700"
            >
              {isCurrent && isPlaying ? <PauseIcon /> : <PlayIcon />}
            </button>

            <Link to={`/albums/${track.albumId}`} className="shrink-0">
              <CoverArt
                album={{ coverUrl: track.coverUrl, title: track.albumTitle }}
                className="size-10 rounded"
              />
            </Link>

            <div className="min-w-0 flex-1">
              <p className={`truncate ${isCurrent ? 'font-semibold text-brand-700 dark:text-brand-300' : ''}`}>
                {track.title}
              </p>
              <TrackMeta track={track} />
            </div>

            <span className="shrink-0 text-sm tabular-nums text-slate-500">
              {formatDuration(track.duration)}
            </span>

            <FavouriteButton track={track} />

            <AddToPlaylist albumId={track.albumId} track={track} />

            <a
              href={mediaUrl(track.downloadUrl)}
              download
              title={`Download ${track.title}`}
              className="shrink-0 rounded-md p-2 text-slate-400 transition hover:bg-slate-100 hover:text-brand-600"
            >
              <DownloadIcon />
            </a>
          </li>
        );
      })}
      </ul>
    </div>
  );
}

function PageButton({ disabled, onClick, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

const strokeProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  className: 'size-4',
};

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="size-4">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="size-4">
      <path d="M7 5h3v14H7zM14 5h3v14h-3z" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg {...strokeProps}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </svg>
  );
}
