import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { playlistsApi } from '../lib/api.js';
import { useAuth } from '../lib/AuthContext.jsx';

const MENU_WIDTH = 256;
const MENU_GAP = 6;
const VIEWPORT_MARGIN = 8;

/**
 * The "+" beside a track: a small menu of the listener's playlists, plus a box
 * to start a new one.
 *
 * The list is fetched when the menu is first opened rather than on mount, so a
 * long album does not fire one request per row.
 *
 * The menu renders into <body> through a portal instead of next to its button.
 * The track list clips its own corners with overflow-hidden, which would cut
 * the menu off no matter what z-index it carried — clipping is not something a
 * stacking order can escape. Being out of that subtree also puts it above the
 * sticky header and the player bar without having to out-bid them.
 */
export default function AddToPlaylist({ albumId, track, bulk = null, count = 0, label = null }) {
  const { isAuthenticated } = useAuth();

  const [open, setOpen] = useState(false);
  const [playlists, setPlaylists] = useState(null);
  const [status, setStatus] = useState(null); // { kind: 'error' | 'done', message }
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState('');
  const [coords, setCoords] = useState(null);

  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  /**
   * Pin the menu to its button in viewport coordinates. Falls back to an
   * estimated height on the first pass, before there is a menu to measure, and
   * is corrected below once there is.
   */
  const place = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const height = menuRef.current?.offsetHeight ?? 280;

    // Below the button, unless that would run off the bottom of the window.
    let top = rect.bottom + MENU_GAP;
    if (top + height > window.innerHeight - VIEWPORT_MARGIN) {
      top = Math.max(VIEWPORT_MARGIN, rect.top - height - MENU_GAP);
    }

    // Right edges aligned, kept inside the window on a narrow screen.
    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, rect.right - MENU_WIDTH),
      window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN
    );

    setCoords({ top, left });
  }, []);

  // Re-measure once the menu is on screen, and again whenever its contents
  // change height. A layout effect, so the correction never reaches paint.
  useLayoutEffect(() => {
    if (open) place();
  }, [open, playlists, status, place]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event) => {
      // The menu is no longer inside the button's wrapper, so both count as
      // "inside" for the purpose of dismissing.
      if (buttonRef.current?.contains(event.target)) return;
      if (menuRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const onKeyDown = (event) => event.key === 'Escape' && setOpen(false);
    // Fixed to the viewport, so it has to follow its button as the page moves.
    const onReflow = () => place();

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onReflow, true);
    window.addEventListener('resize', onReflow);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onReflow, true);
      window.removeEventListener('resize', onReflow);
    };
  }, [open, place]);

  // Signed out there is nothing to add to, and the API would refuse anyway.
  // Checked after the hooks so the hook order never changes between renders.
  if (!isAuthenticated) return null;

  async function openMenu() {
    place();
    setOpen(true);
    setStatus(null);
    if (playlists) return; // already loaded this session

    try {
      // Favourites is in that list but cannot be added to: it is filled by
      // starring a track, and the API refuses entries. Offering it would be a
      // menu item that only ever errors.
      const all = await playlistsApi.list();
      setPlaylists(all.filter((playlist) => !playlist.isDefault));
    } catch (err) {
      setStatus({ kind: 'error', message: err.message });
      setPlaylists([]);
    }
  }

  /**
   * One request either way.
   *
   * The bulk reply says how many of the batch were genuinely new, which is the
   * only honest thing to report: half a record is usually already on the
   * playlist you are adding it to, and "added 12" when nine were already there
   * would be a lie the listener can see through.
   */
  async function add(playlist) {
    setBusy(true);
    try {
      if (bulk) {
        const { added, skipped, playlist: updated } = await playlistsApi.addTracks(
          playlist.id,
          bulk
        );
        setPlaylists((all) => all.map((p) => (p.id === updated.id ? updated : p)));
        setStatus({
          kind: 'done',
          message: added
            ? `Added ${added} to ${updated.name}${skipped ? `, ${skipped} already there` : ''}`
            : `All ${skipped} already on ${updated.name}`,
        });
        return;
      }

      const updated = await playlistsApi.addTrack(playlist.id, albumId, track.id);
      setPlaylists((all) => all.map((p) => (p.id === updated.id ? updated : p)));
      setStatus({ kind: 'done', message: `Added to ${updated.name}` });
    } catch (err) {
      setStatus({ kind: 'error', message: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function createAndAdd(event) {
    event.preventDefault();
    if (!newName.trim()) return;

    setBusy(true);
    try {
      const created = await playlistsApi.create({ name: newName.trim() });

      const updated = bulk
        ? (await playlistsApi.addTracks(created.id, bulk)).playlist
        : await playlistsApi.addTrack(created.id, albumId, track.id);

      setPlaylists((all) => [...(all ?? []), updated].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName('');
      setStatus({
        kind: 'done',
        // A brand new playlist has nothing to skip, so the count is the batch.
        message: bulk ? `Added ${count} to ${updated.name}` : `Added to ${updated.name}`,
      });
    } catch (err) {
      setStatus({ kind: 'error', message: err.message });
    } finally {
      setBusy(false);
    }
  }

  const menu = (
    <div
      ref={menuRef}
      style={{ top: coords?.top ?? 0, left: coords?.left ?? 0, width: MENU_WIDTH }}
      className="fixed z-50 rounded-lg border border-slate-200 bg-surface p-2 shadow-xl"
    >
      {playlists === null ? (
        <p className="px-2 py-3 text-sm text-slate-500">Loading…</p>
      ) : playlists.length === 0 ? (
        <p className="px-2 py-2 text-sm text-slate-500">No playlists yet.</p>
      ) : (
        <ul className="max-h-56 overflow-y-auto">
          {playlists.map((playlist) => {
            // Only meaningful for a single track. A batch is nearly always
            // part-new, so the entry stays live and the reply reports the split.
            const alreadyOn = !bulk && playlist.tracks?.some((t) => t.id === track.id);

            return (
              <li key={playlist.id}>
                <button
                  onClick={() => add(playlist)}
                  disabled={busy || alreadyOn}
                  className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm transition hover:bg-slate-100 disabled:cursor-default disabled:text-slate-400 disabled:hover:bg-transparent"
                >
                  <span className="truncate">{playlist.name}</span>
                  {alreadyOn && <CheckIcon />}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={createAndAdd} className="mt-2 flex gap-1 border-t border-slate-200 pt-2">
        <input
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          placeholder="New playlist"
          maxLength={120}
          className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-sm outline-none focus:border-brand-500"
        />
        <button
          type="submit"
          disabled={busy || !newName.trim()}
          className="shrink-0 rounded bg-brand-600 px-2 py-1 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-40"
        >
          Add
        </button>
      </form>

      {status && (
        <p
          className={`mt-2 px-2 text-xs ${
            status.kind === 'error' ? 'text-red-600' : 'text-slate-500'
          }`}
        >
          {status.message}
        </p>
      )}
    </div>
  );

  const title = bulk
    ? `Add ${count} ${count === 1 ? 'track' : 'tracks'} to a playlist`
    : `Add ${track.title} to a playlist`;

  return (
    <div className="shrink-0">
      {/* A labelled button where it stands on its own in a toolbar, the bare
          "+" where it sits at the end of a track row among other icons. */}
      <button
        ref={buttonRef}
        onClick={() => (open ? setOpen(false) : openMenu())}
        aria-haspopup="menu"
        aria-expanded={open}
        title={title}
        aria-label={title}
        className={
          label
            ? 'flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 dark:hover:text-brand-300'
            : 'rounded-md p-2 text-slate-400 transition hover:bg-slate-100 hover:text-brand-600'
        }
      >
        <PlusIcon />
        {label}
      </button>

      {open && createPortal(menu, document.body)}
    </div>
  );
}

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden="true"
      className="size-4"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-4 shrink-0 text-brand-600"
    >
      <path d="m20 6-11 11-5-5" />
    </svg>
  );
}
