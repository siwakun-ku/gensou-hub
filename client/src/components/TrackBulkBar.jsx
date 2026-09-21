import { useState } from 'react';
import AddToPlaylist from './AddToPlaylist.jsx';
import { useAuth } from '../lib/AuthContext.jsx';
import { useFavourites } from '../lib/FavouritesContext.jsx';

/**
 * Favourite or shelve a whole list of tracks at once — a record on an album
 * page, a page of results on the search page.
 *
 * With nothing ticked the actions read "all" and act on the whole list; tick
 * some and they act on those instead. One set of controls rather than two,
 * because "add everything" and "add these" are the same intent at different
 * scopes — and a listener who has ticked three tracks should not have to find
 * a different button from the one they were just looking at.
 */
export default function TrackBulkBar({
  tracks,
  selectedIds,
  onSelectAll,
  onClear,
  albumId = null,
}) {
  const { isAuthenticated } = useAuth();
  const { ids, addMany, removeMany } = useFavourites();

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null); // { kind: 'error' | 'done', message }

  // Signed out there is nothing to add to, and the API would refuse anyway.
  if (!isAuthenticated || tracks.length === 0) return null;

  const picked = tracks.filter((track) => selectedIds.has(track.id));
  const acting = picked.length > 0 ? picked : tracks;
  const everything = picked.length === 0;

  /*
   * `albumId` says these tracks are exactly one record, which lets the whole-
   * album case travel as just that id: the server expands it, so the request
   * stays right even if the record gained a track since the page loaded.
   *
   * A list that is not one album — a page of search results, say — has no such
   * shorthand and names its tracks one by one. Each carries its own albumId,
   * so the batch can span as many records as it likes.
   */
  const payload =
    everything && albumId
      ? { albumId }
      : { items: acting.map((track) => ({ albumId: track.albumId ?? albumId, trackId: track.id })) };

  /*
   * The favourite action is a toggle over the whole batch, and which way it
   * goes is decided by the batch as a whole: it undoes only when there is
   * nothing left to do: every track in scope is already a favourite. Anything
   * short of that — none of them, or some of them — means the intent is to
   * finish the job, so it favourites the rest.
   *
   * The alternative, flipping each track independently, would turn a
   * part-favourited album into its own photographic negative on one click,
   * which is never what anybody wanted.
   */
  const allFavourited = acting.every((track) => ids.has(track.id));

  async function toggleFavourites() {
    setBusy(true);
    setStatus(null);
    try {
      if (allFavourited) {
        const { removed } = await removeMany(payload);
        setStatus({ kind: 'done', message: `Removed ${removed} from favourites` });
        return;
      }

      const { added, skipped } = await addMany(payload);
      setStatus({
        kind: 'done',
        message: `Favourited ${added}${skipped ? `, ${skipped} already were` : ''}`,
      });
    } catch (err) {
      setStatus({ kind: 'error', message: err.message });
    } finally {
      setBusy(false);
    }
  }

  const noun = acting.length === 1 ? 'track' : 'tracks';

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-slate-200 bg-surface px-4 py-3">
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={picked.length === tracks.length}
          // Some but not all: neither ticked nor empty, which is what the box
          // actually means here.
          ref={(box) => box && (box.indeterminate = !everything && picked.length < tracks.length)}
          onChange={(event) => (event.target.checked ? onSelectAll() : onClear())}
          aria-label="Select every track"
          className="size-4 accent-brand-600"
        />
        {everything ? 'Select tracks' : `${picked.length} selected`}
      </label>

      <span className="flex-1" />

      {/* Filled while every track in scope is already a favourite — which is
          also the state in which the button undoes rather than adds. */}
      <button
        onClick={toggleFavourites}
        disabled={busy}
        className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 ${
          allFavourited
            ? 'border-rose-300 bg-rose-50 text-rose-600 hover:bg-rose-100'
            : 'border-slate-300 text-slate-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600'
        }`}
      >
        <HeartIcon filled={allFavourited} />
        {allFavourited ? 'Remove' : 'Favourite'} {everything ? `all ${acting.length}` : picked.length}
      </button>

      <AddToPlaylist
        bulk={payload}
        count={acting.length}
        label={everything ? `Add all ${tracks.length} to playlist` : `Add ${picked.length} to playlist`}
      />

      {status && (
        <p
          role="status"
          className={`w-full text-xs ${
            status.kind === 'error' ? 'text-red-600' : 'text-slate-500'
          }`}
        >
          {status.message}
        </p>
      )}

      {!status && (
        <p className="w-full text-xs text-slate-400">
          {everything
            ? `Acts on all ${tracks.length} ${noun} unless you tick some.`
            : `Acts on the ${picked.length} ${noun} you ticked.`}
        </p>
      )}
    </div>
  );
}

function HeartIcon({ filled = false }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-4"
    >
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 0 0 0-7.8Z" />
    </svg>
  );
}
