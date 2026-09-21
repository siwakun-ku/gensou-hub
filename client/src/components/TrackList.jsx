import { useState } from 'react';
import TrackEditRow from './TrackEditRow.jsx';
import AddToPlaylist from './AddToPlaylist.jsx';
import FavouriteButton from './FavouriteButton.jsx';
import TrackMeta from './TrackMeta.jsx';
import { mediaUrl } from '../lib/api.js';
import { formatDuration, formatBytes } from '../lib/format.js';
import { usePlayer } from '../lib/PlayerContext.jsx';

/**
 * `selectedIds` turns the list into a pickable one: pass a Set and each row
 * gains a checkbox. Left out, the list is exactly what it was.
 */
export default function TrackList({
  album,
  canManage = false,
  onDelete,
  onSaved,
  selectedIds = null,
  onToggleSelect,
}) {
  const { current, isPlaying, play } = usePlayer();
  const [editingId, setEditingId] = useState(null);

  if (album.tracks.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-slate-500">
        This album has no tracks yet.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-surface">
      {album.tracks.map((track) => {
        const isCurrent = current?.track.id === track.id;

        if (canManage && editingId === track.id) {
          return (
            <li key={track.id} className="bg-slate-50 px-4 py-4">
              <TrackEditRow
                album={album}
                track={track}
                onCancel={() => setEditingId(null)}
                onSaved={async () => {
                  setEditingId(null);
                  await onSaved?.();
                }}
              />
            </li>
          );
        }

        const selected = selectedIds?.has(track.id) ?? false;

        return (
          <li
            key={track.id}
            className={`flex items-center gap-3 px-4 py-3 transition ${
              isCurrent ? 'bg-brand-50' : selected ? 'bg-brand-50/50' : 'hover:bg-slate-50'
            }`}
          >
            {selectedIds && (
              <input
                type="checkbox"
                checked={selected}
                onChange={() => onToggleSelect?.(track.id)}
                aria-label={`Select ${track.title}`}
                className="size-4 shrink-0 accent-brand-600"
              />
            )}

            <button
              onClick={() => play(track, album)}
              aria-label={isCurrent && isPlaying ? `Pause ${track.title}` : `Play ${track.title}`}
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white transition hover:bg-brand-700"
            >
              {isCurrent && isPlaying ? <PauseIcon /> : <PlayIcon />}
            </button>

            <span className="w-6 shrink-0 text-right text-sm tabular-nums text-slate-400">
              {track.trackNumber}
            </span>

            <div className="min-w-0 flex-1">
              <p className={`truncate ${isCurrent ? 'font-semibold text-brand-700 dark:text-brand-300' : ''}`}>
                {track.title}
              </p>
              {/* The album is the page they are already on, so it is left
                  out here — the rest of the credits are not. */}
              <TrackMeta track={track} showAlbum={false} />
              <p className="truncate text-xs text-slate-400">{formatBytes(track.size)}</p>
            </div>

            <span className="shrink-0 text-sm tabular-nums text-slate-500">
              {formatDuration(track.duration)}
            </span>

            <FavouriteButton track={{ ...track, albumId: album.id }} />

            <AddToPlaylist albumId={album.id} track={track} />

            <a
              href={mediaUrl(track.downloadUrl)}
              download
              title={`Download ${track.title}`}
              className="shrink-0 rounded-md p-2 text-slate-400 transition hover:bg-slate-100 hover:text-brand-600"
            >
              <DownloadIcon />
            </a>

            {canManage && (
              <button
                onClick={() => setEditingId(track.id)}
                title={`Edit ${track.title}`}
                className="shrink-0 rounded-md p-2 text-slate-400 transition hover:bg-slate-100 hover:text-brand-600"
              >
                <PencilIcon />
              </button>
            )}

            {canManage && onDelete && (
              <button
                onClick={() => onDelete(track)}
                title={`Delete ${track.title}`}
                className="shrink-0 rounded-md p-2 text-slate-300 transition hover:bg-red-50 hover:text-red-600"
              >
                <TrashIcon />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

const iconProps = {
  className: 'size-4',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

function PlayIcon() {
  return (
    <svg {...iconProps} fill="currentColor" stroke="none">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg {...iconProps} fill="currentColor" stroke="none">
      <path d="M7 5h3v14H7zM14 5h3v14h-3z" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg {...iconProps}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    </svg>
  );
}
