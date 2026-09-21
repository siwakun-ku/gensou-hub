import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PlaylistCover from '../components/PlaylistCover.jsx';
import { playlistsApi } from '../lib/api.js';
import { formatDuration } from '../lib/format.js';
import { usePlayer } from '../lib/PlayerContext.jsx';
import { ErrorMessage, Input } from '../components/FormControls.jsx';

/** The signed-in listener's own playlists, with a form to start another. */
export default function Playlists() {
  const { current, isPlaying, play } = usePlayer();

  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    playlistsApi
      .list()
      .then(setPlaylists)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate(event) {
    event.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    setError(null);
    try {
      const created = await playlistsApi.create({ name: name.trim() });
      // Name order, as the API lists them — but Favourites stays pinned on top
      // rather than sorting itself in among them.
      setPlaylists((all) => [
        ...all.filter((playlist) => playlist.isDefault),
        ...[...all.filter((playlist) => !playlist.isDefault), created].sort((a, b) =>
          a.name.localeCompare(b.name)
        ),
      ]);
      setName('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(playlist) {
    if (!window.confirm(`Delete "${playlist.name}"? This cannot be undone.`)) return;

    try {
      await playlistsApi.remove(playlist.id);
      setPlaylists((all) => all.filter((p) => p.id !== playlist.id));
    } catch (err) {
      setError(err.message);
    }
  }

  // Everything but the built-in one, which every account has whether or not it
  // has made a playlist of its own.
  const made = playlists.filter((playlist) => !playlist.isDefault);

  return (
    <section className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Your playlists</h1>
          <p className="mt-1 text-sm text-slate-500">
            Collect tracks from any album. Playlists are private to your account.
          </p>
        </div>

        {/*
         * The form sits on the heading row rather than above the grid: it is
         * one field, and given a row of its own it read as the main event on a
         * page whose point is the playlists underneath it.
         */}
        <form onSubmit={handleCreate} className="flex items-center gap-2">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="New playlist…"
            aria-label="New playlist name"
            maxLength={120}
          />
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="shrink-0 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? 'Creating…' : 'Create'}
          </button>
        </form>
      </div>

      <ErrorMessage>{error}</ErrorMessage>

      {loading ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((key) => (
            <div key={key} className="animate-pulse space-y-3">
              <div className="aspect-square w-full rounded-2xl bg-slate-200" />
              <div className="h-4 w-2/3 rounded bg-slate-200" />
            </div>
          ))}
        </div>
      ) : (
        <>
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {playlists.map((playlist) => (
              <PlaylistCard
                key={playlist.id}
                playlist={playlist}
                current={current}
                isPlaying={isPlaying}
                onPlay={play}
                onDelete={handleDelete}
              />
            ))}
          </ul>

          {/* Only once the built-in one is all there is: the grid is never
              empty, so the usual empty state would never show. */}
          {made.length === 0 && (
            <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
              You have not made a playlist yet. Name one above, then use “Add to playlist” on any
              track.
            </p>
          )}
        </>
      )}
    </section>
  );
}

/**
 * One playlist, at the size its artwork deserves.
 *
 * The cover leads the card because a playlist is recognised by what is in it
 * long before its name is read — which is the whole reason it borrows the
 * albums' artwork in the first place.
 */
function PlaylistCard({ playlist, current, isPlaying, onPlay, onDelete }) {
  const empty = playlist.trackCount === 0;
  /*
   * Lit while this playlist is the one the player is working through. The
   * player calls whatever it was given `album`, playlist or otherwise — it only
   * ever needs an id, a title and tracks.
   */
  const isCurrent = !empty && current?.album?.id === playlist.id;
  const playing = isCurrent && isPlaying;

  // The built-in one has a page of its own, where the star that fills it is on
  // every row.
  const to = playlist.isDefault ? '/favourites' : `/playlists/${playlist.id}`;

  return (
    <li
      className={`group flex flex-col overflow-hidden rounded-2xl border bg-surface transition hover:-translate-y-1 hover:shadow-xl ${
        isCurrent ? 'border-brand-400 ring-1 ring-brand-400' : 'border-slate-200'
      }`}
    >
      <div className="relative">
        {/* The artwork is a plain link. The play button is a sibling rather
            than a child of it: a button inside an anchor is not valid, and
            nesting them makes the whole cover ambiguous to click. */}
        <Link to={to} tabIndex={-1} aria-hidden="true" className="block">
          <PlaylistCover playlist={playlist} className="aspect-square w-full" />
        </Link>

        {/*
         * Sits over the corner of the artwork, lifted on hover the way the
         * card is. Always visible rather than revealed on hover: on a touch
         * screen there is no hover, and the one thing a playlist is for is
         * being played.
         */}
        {!empty && (
          <button
            onClick={() => onPlay(playlist.tracks[0], asQueue(playlist))}
            aria-label={playing ? `Pause ${playlist.name}` : `Play ${playlist.name}`}
            className="absolute bottom-3 right-3 flex size-12 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg transition hover:scale-105 hover:bg-brand-700 active:scale-100"
          >
            {playing ? <PauseIcon /> : <PlayIcon />}
          </button>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-5">
        <div className="flex items-start justify-between gap-2">
          <Link to={to} className="min-w-0 flex-1">
            <h2 className="flex items-center gap-2 truncate text-xl font-semibold transition hover:text-brand-600">
              <span className="truncate">{playlist.name}</span>
              {playlist.isDefault && (
                <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700 dark:text-brand-300">
                  Built in
                </span>
              )}
            </h2>
          </Link>

          {/* No delete on the built-in one: there is nothing stored to delete,
              and emptying it means unstarring the tracks. */}
          {!playlist.isDefault && (
            <button
              onClick={() => onDelete(playlist)}
              title={`Delete ${playlist.name}`}
              aria-label={`Delete ${playlist.name}`}
              className="-mr-1 -mt-1 shrink-0 rounded-md p-2 text-slate-300 transition hover:bg-red-50 hover:text-red-600"
            >
              <TrashIcon />
            </button>
          )}
        </div>

        <p className="text-sm text-slate-500">
          {playlist.trackCount} {playlist.trackCount === 1 ? 'track' : 'tracks'}
          {playlist.totalDuration > 0 && ` · ${formatDuration(playlist.totalDuration)}`}
          {playlist.isDefault && ' · fills itself as you star tracks'}
        </p>
      </div>
    </li>
  );
}

/**
 * A playlist stands in for an album as the player's queue: the player only
 * needs an id, something to call it, and the tracks.
 */
export function asQueue(playlist) {
  return { id: playlist.id, title: playlist.name, tracks: playlist.tracks };
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="size-5">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="size-5">
      <path d="M7 5h3v14H7zM14 5h3v14h-3z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-4"
    >
      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    </svg>
  );
}
