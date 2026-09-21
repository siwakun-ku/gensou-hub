import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import CoverArt from '../components/CoverArt.jsx';
import TrackMeta from '../components/TrackMeta.jsx';
import FavouriteButton from '../components/FavouriteButton.jsx';
import AddToPlaylist from '../components/AddToPlaylist.jsx';
import PlaylistCover from '../components/PlaylistCover.jsx';
import TrackBulkBar from '../components/TrackBulkBar.jsx';
import { ErrorMessage } from '../components/FormControls.jsx';
import { playlistsApi, mediaUrl } from '../lib/api.js';
import { formatDuration } from '../lib/format.js';
import { usePlayer } from '../lib/PlayerContext.jsx';
import { asQueue } from './Playlists.jsx';

export default function PlaylistDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { current, isPlaying, play } = usePlayer();

  const [playlist, setPlaylist] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState('');
  const [preparing, setPreparing] = useState(false);
  // Which entries the bulk actions apply to. Empty means "the whole playlist".
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  const toggleSelect = (trackId) =>
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(trackId)) next.delete(trackId);
      else next.add(trackId);
      return next;
    });

  useEffect(() => {
    setLoading(true);
    playlistsApi
      .get(id)
      .then((data) => {
        setPlaylist(data);
        setName(data.name);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  /** Every mutation hands back the updated playlist, so none of these re-fetch. */
  async function apply(request) {
    setError(null);
    try {
      setPlaylist(await request());
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRename(event) {
    event.preventDefault();
    if (!name.trim() || name.trim() === playlist.name) return setRenaming(false);

    await apply(() => playlistsApi.update(playlist.id, { name: name.trim() }));
    setRenaming(false);
  }

  /**
   * The credential is only good for a minute, so it is fetched on the click
   * rather than baked into a link when the page loads. Navigating to the URL
   * lets the browser stream the zip to disk; the Content-Disposition on the
   * response means it downloads rather than replacing the page.
   */
  async function handleDownload() {
    setPreparing(true);
    setError(null);
    try {
      window.location.href = await playlistsApi.downloadUrl(playlist.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setPreparing(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete "${playlist.name}"? This cannot be undone.`)) return;

    try {
      await playlistsApi.remove(playlist.id);
      navigate('/playlists');
    } catch (err) {
      setError(err.message);
    }
  }

  /** Move an entry one place up or down and save the new running order. */
  function move(index, offset) {
    const order = playlist.tracks.map((track) => track.itemId);
    const target = index + offset;
    if (target < 0 || target >= order.length) return;

    [order[index], order[target]] = [order[target], order[index]];
    return apply(() => playlistsApi.reorder(playlist.id, order));
  }

  if (loading) return <p className="text-slate-500">Loading playlist…</p>;
  if (!playlist)
    return (
      <div className="space-y-3">
        <ErrorMessage>{error ?? 'Playlist not found'}</ErrorMessage>
        <Link to="/playlists" className="text-brand-600 underline">
          Back to your playlists
        </Link>
      </div>
    );

  const queue = asQueue(playlist);

  return (
    <section className="space-y-6">
      {/* Laid out like an album page, since it is the same kind of thing: the
          artwork alongside, the details and controls beside it. */}
      <header className="flex flex-col gap-6 sm:flex-row">
        <PlaylistCover
          playlist={playlist}
          className="aspect-square w-full rounded-xl sm:size-48"
        />

        <div className="flex flex-1 flex-col justify-end gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Playlist</p>

        {renaming ? (
          <form onSubmit={handleRename} className="flex flex-wrap items-center gap-2">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              autoFocus
              className="min-w-56 flex-1 rounded-md border border-slate-300 px-3 py-2 text-2xl font-bold outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
            />
            <button
              type="submit"
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setName(playlist.name);
                setRenaming(false);
              }}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Cancel
            </button>
          </form>
        ) : (
          <h1 className="text-3xl font-bold">{playlist.name}</h1>
        )}

        <p className="text-sm text-slate-500">
          {playlist.trackCount} {playlist.trackCount === 1 ? 'track' : 'tracks'}
          {playlist.totalDuration > 0 && ` · ${formatDuration(playlist.totalDuration)}`}
        </p>

        <div className="flex flex-wrap gap-2">
          <button
            disabled={playlist.trackCount === 0}
            onClick={() => play(playlist.tracks[0], queue)}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Play playlist
          </button>
          {playlist.downloadUrl && (
            <button
              onClick={handleDownload}
              disabled={preparing}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 dark:hover:text-brand-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {preparing ? 'Preparing…' : 'Download playlist'}
            </button>
          )}
          {!renaming && (
            <button
              onClick={() => setRenaming(true)}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Rename
            </button>
          )}
          <button
            onClick={handleDelete}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-red-300 hover:bg-red-50 hover:text-red-600"
          >
            Delete playlist
          </button>
        </div>
        </div>
      </header>

      <ErrorMessage>{error}</ErrorMessage>

      {playlist.tracks.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-500">
          Nothing here yet. Open an album and use “Add to playlist” on any track.
        </p>
      ) : (
        <div className="space-y-3">
        {/* No albumId: a playlist gathers tracks from across the library, so
            the batch names them one by one. */}
        <TrackBulkBar
          tracks={playlist.tracks}
          selectedIds={selectedIds}
          onSelectAll={() => setSelectedIds(new Set(playlist.tracks.map((track) => track.id)))}
          onClear={() => setSelectedIds(new Set())}
        />

        <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-surface">
          {playlist.tracks.map((track, index) => {
            const isCurrent = current?.track.id === track.id;
            const selected = selectedIds.has(track.id);

            return (
              <li
                key={track.itemId}
                className={`flex items-center gap-2 px-3 py-3 transition sm:gap-3 sm:px-4 ${
                  isCurrent ? 'bg-brand-50' : selected ? 'bg-brand-50/50' : 'hover:bg-slate-50'
                }`}
              >
                {/* The page is behind a sign-in, so there is always an account
                    for the bulk actions to act on. */}
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggleSelect(track.id)}
                  aria-label={`Select ${track.title}`}
                  className="size-4 shrink-0 accent-brand-600"
                />

                <button
                  onClick={() => play(track, queue)}
                  aria-label={
                    isCurrent && isPlaying ? `Pause ${track.title}` : `Play ${track.title}`
                  }
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white transition hover:bg-brand-700"
                >
                  {isCurrent && isPlaying ? <PauseIcon /> : <PlayIcon />}
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
                  <Link
                    to={`/albums/${track.albumId}`}
                    className="text-xs text-slate-400 hover:text-brand-600"
                  >
                    Go to album
                  </Link>
                </div>

                {/* The row carries six controls once the phone width allows
                    it. Below that the duration and the per-track download step
                    aside — the download because the album page still offers
                    it, and the duration because it is the one thing here that
                    is not a control. */}
                <span className="hidden shrink-0 text-sm tabular-nums text-slate-500 sm:block">
                  {formatDuration(track.duration)}
                </span>

                <FavouriteButton track={track} />

                {/* The playlist being looked at is in this menu too, already
                    ticked and unclickable — the component disables any list
                    the track is on, so no special case is needed here. */}
                <AddToPlaylist albumId={track.albumId} track={track} />

                <a
                  href={mediaUrl(track.downloadUrl)}
                  download
                  title={`Download ${track.title}`}
                  aria-label={`Download ${track.title}`}
                  className="hidden shrink-0 rounded-md p-2 text-slate-400 transition hover:bg-slate-100 hover:text-brand-600 sm:block"
                >
                  <DownloadIcon />
                </a>

                {/* Up/down rather than drag: it works on a phone and with a
                    keyboard, and the lists are short. */}
                <div className="flex shrink-0 flex-col">
                  <button
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label={`Move ${track.title} up`}
                    className="rounded p-0.5 text-slate-400 transition hover:text-brand-600 disabled:opacity-20 disabled:hover:text-slate-400"
                  >
                    <ChevronIcon />
                  </button>
                  <button
                    onClick={() => move(index, 1)}
                    disabled={index === playlist.tracks.length - 1}
                    aria-label={`Move ${track.title} down`}
                    className="rotate-180 rounded p-0.5 text-slate-400 transition hover:text-brand-600 disabled:opacity-20 disabled:hover:text-slate-400"
                  >
                    <ChevronIcon />
                  </button>
                </div>

                <button
                  onClick={() => apply(() => playlistsApi.removeItem(playlist.id, track.itemId))}
                  title={`Remove ${track.title} from this playlist`}
                  className="shrink-0 rounded-md p-2 text-slate-300 transition hover:bg-red-50 hover:text-red-600"
                >
                  <RemoveIcon />
                </button>
              </li>
            );
          })}
        </ul>
        </div>
      )}
    </section>
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

function ChevronIcon() {
  return (
    <svg {...strokeProps} className="size-4">
      <path d="m18 15-6-6-6 6" />
    </svg>
  );
}

function RemoveIcon() {
  return (
    <svg {...strokeProps} className="size-4">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg {...strokeProps} className="size-4">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </svg>
  );
}
