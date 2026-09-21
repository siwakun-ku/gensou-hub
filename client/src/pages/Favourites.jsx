import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import CoverArt from '../components/CoverArt.jsx';
import TrackMeta from '../components/TrackMeta.jsx';
import AddToPlaylist from '../components/AddToPlaylist.jsx';
import FavouriteButton from '../components/FavouriteButton.jsx';
import PlaylistCover from '../components/PlaylistCover.jsx';
import TrackBulkBar from '../components/TrackBulkBar.jsx';
import { ErrorMessage } from '../components/FormControls.jsx';
import { favouritesApi, playlistsApi, mediaUrl } from '../lib/api.js';
import { formatDuration } from '../lib/format.js';
import { useFavourites } from '../lib/FavouritesContext.jsx';
import { usePlayer } from '../lib/PlayerContext.jsx';

/** The derived playlist's id on the server: Favourites is not a document. */
const QUEUE_ID = 'favourites';

export default function Favourites() {
  const { current, isPlaying, play, shuffle, toggleShuffle } = usePlayer();
  const { ids } = useFavourites();

  const [tracks, setTracks] = useState([]);
  const [totalDuration, setTotalDuration] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [preparing, setPreparing] = useState(false);
  // Which rows the bulk actions apply to. Empty means "everything starred".
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  const toggleSelect = useCallback((trackId) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(trackId)) next.delete(trackId);
      else next.add(trackId);
      return next;
    });
  }, []);

  const load = useCallback(
    () =>
      favouritesApi
        .list()
        .then((result) => {
          setTracks(result.data);
          setTotalDuration(result.totalDuration);
          setError(null);
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false)),
    []
  );

  useEffect(() => {
    load();
  }, [load]);

  /*
   * Unstarring a row here would otherwise leave it sitting in a list it no
   * longer belongs to. The rows are dropped as the set shrinks rather than
   * re-fetched, so the page does not jump — and a star put back reappears
   * because the track is still in hand.
   */
  const shown = tracks.filter((track) => ids.has(track.id));
  const queue = { id: QUEUE_ID, title: 'Favourites', tracks: shown };
  const empty = shown.length === 0;

  /*
   * Whether the player is working through this list rather than something else
   * that happens to contain the same track.
   *
   * The main button follows it: while this queue is loaded it acts on the track
   * that is actually up — pausing it, or resuming where it left off — instead
   * of throwing the listener back to the top of the list.
   */
  const onThisQueue = current?.album?.id === QUEUE_ID;
  const playingHere = onThisQueue && isPlaying;

  /** Turn shuffle on if it is not already, and start somewhere arbitrary. */
  function handleShuffle() {
    if (!shuffle) toggleShuffle();
    play(shown[Math.floor(Math.random() * shown.length)], queue);
  }

  /**
   * The credential is only good for a minute, so it is fetched on the click
   * rather than baked into a link when the page loads. Favourites is read-only
   * as a playlist, but reading is exactly what a download is, so the server
   * allows this one.
   */
  async function handleDownload() {
    setPreparing(true);
    setError(null);
    try {
      window.location.href = await playlistsApi.downloadUrl(QUEUE_ID);
    } catch (err) {
      setError(err.message);
    } finally {
      setPreparing(false);
    }
  }

  return (
    <section className="space-y-6">
      {/* Laid out like an album and a playlist, because it is the same kind of
          thing: the artwork alongside, the details and controls beside it. */}
      <header className="flex flex-col gap-6 sm:flex-row">
        <PlaylistCover
          playlist={{ tracks: shown }}
          className="aspect-square w-full rounded-2xl shadow-lg sm:size-48"
        />

        <div className="flex flex-1 flex-col justify-end gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Built-in playlist
          </p>

          <h1 className="text-3xl font-bold">Your favourites</h1>

          <p className="text-sm text-slate-500">
            {shown.length} {shown.length === 1 ? 'track' : 'tracks'}
            {totalDuration > 0 && ` · ${formatDuration(totalDuration)}`} · most recently starred
            first · private to you
          </p>

          {/*
           * The three things a playlist page offers that this one cannot.
           * Favourites is not stored — it is read from the tracks you star —
           * so there is no name to change, no document to delete, and no
           * running order to rearrange. Saying so beats leaving someone to
           * hunt for buttons that are never coming.
           */}
          {!empty && (
            <p className="text-xs text-slate-400">
              Built from the hearts below, so it fills and empties as you star tracks — nothing to
              rename, reorder or delete.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              disabled={empty}
              onClick={() => play(onThisQueue ? current.track : shown[0], queue)}
              className="flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {playingHere ? <PauseIcon /> : <PlayIcon />}
              {playingHere ? 'Pause' : onThisQueue ? 'Resume' : 'Play all'}
            </button>

            <button
              disabled={empty}
              onClick={handleShuffle}
              className="flex items-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:text-brand-300"
            >
              <ShuffleIcon />
              Shuffle
            </button>

            {/* Favourites has always been downloadable on the server; this page
                simply never offered it. */}
            <button
              disabled={empty || preparing}
              onClick={handleDownload}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:text-brand-300"
            >
              {preparing ? 'Preparing…' : 'Download all'}
            </button>
          </div>
        </div>
      </header>

      <ErrorMessage>{error}</ErrorMessage>

      {loading ? (
        <p className="text-slate-500">Loading favourites…</p>
      ) : empty ? (
        <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center">
          <p className="font-medium text-slate-600">Nothing starred yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            Tap the heart beside any track and it lands here, and in the Favourites playlist, on
            every device you sign in on.
          </p>
          <Link
            to="/"
            className="mt-4 inline-block rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
          >
            Browse the library
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {/*
           * Everything here is starred by definition, so the favourite action
           * on this page only ever reads "Remove" — which is exactly what it is
           * for: clearing a batch out without hunting down each heart.
           */}
          <TrackBulkBar
            tracks={shown}
            selectedIds={selectedIds}
            onSelectAll={() => setSelectedIds(new Set(shown.map((track) => track.id)))}
            onClear={() => setSelectedIds(new Set())}
          />

          <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-surface">
            {shown.map((track, index) => (
              <FavouriteRow
                key={track.id}
                track={track}
                index={index}
                queue={queue}
                current={current}
                isPlaying={isPlaying}
                onPlay={play}
                selected={selectedIds.has(track.id)}
                onToggleSelect={toggleSelect}
              />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/**
 * One starred track.
 *
 * The artwork is the play button, as it is on a playlist card: a row has no
 * room for both, and the cover is where the eye goes anyway.
 */
function FavouriteRow({
  track,
  index,
  queue,
  current,
  isPlaying,
  onPlay,
  selected,
  onToggleSelect,
}) {
  const isCurrent = current?.track.id === track.id;
  const playing = isCurrent && isPlaying;

  return (
    <li
      className={`flex items-center gap-3 px-3 py-2.5 transition sm:px-4 ${
        isCurrent ? 'bg-brand-50' : selected ? 'bg-brand-50/50' : 'hover:bg-slate-50'
      }`}
    >
      {/* The page is behind a sign-in, so there is always an account for the
          bulk actions to act on — no need to gate the box as elsewhere. */}
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggleSelect(track.id)}
        aria-label={`Select ${track.title}`}
        className="size-4 shrink-0 accent-brand-600"
      />

      {/* Position in the list, which the order is meaningful in — the most
          recently starred is first. Hidden on narrow screens, where the width
          is better spent on the title. */}
      <span className="hidden w-6 shrink-0 text-right text-sm tabular-nums text-slate-400 sm:block">
        {index + 1}
      </span>

      {/* A button of its own rather than an overlay on the artwork: the same
          control the playlist and search pages use, and it does not depend on
          hovering to announce itself. */}
      <button
        onClick={() => onPlay(track, queue)}
        aria-label={playing ? `Pause ${track.title}` : `Play ${track.title}`}
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white transition hover:bg-brand-700"
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>

      <CoverArt
        album={{ coverUrl: track.coverUrl, title: track.albumTitle }}
        className="size-10 shrink-0 rounded"
      />

      <div className="min-w-0 flex-1">
        <p className={`truncate ${isCurrent ? 'font-semibold text-brand-700 dark:text-brand-300' : ''}`}>
          {track.title}
        </p>
        <TrackMeta track={track} />
        {/* The way back to where the track came from. The artwork cannot carry
            it here — it is the play button — so it is said in words, as the
            playlist page says it. */}
        <Link
          to={`/albums/${track.albumId}`}
          className="text-xs text-slate-400 transition hover:text-brand-600"
        >
          Go to album
        </Link>
      </div>

      <span className="hidden shrink-0 text-sm tabular-nums text-slate-500 sm:block">
        {formatDuration(track.duration)}
      </span>

      <FavouriteButton track={track} />
      <AddToPlaylist albumId={track.albumId} track={track} />

      {/* Hidden on narrow screens: the row already carries four controls, and
          this is the one with a home elsewhere — the album page. */}
      <a
        href={mediaUrl(track.downloadUrl)}
        download
        title={`Download ${track.title}`}
        className="hidden shrink-0 rounded-md p-2 text-slate-400 transition hover:bg-slate-100 hover:text-brand-600 sm:block"
      >
        <DownloadIcon />
      </a>
    </li>
  );
}

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

function ShuffleIcon() {
  return (
    <svg {...strokeProps}>
      <path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
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
