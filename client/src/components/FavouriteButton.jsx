import { useState } from 'react';
import { useAuth } from '../lib/AuthContext.jsx';
import { useFavourites } from '../lib/FavouritesContext.jsx';

/**
 * The star beside a track.
 *
 * Shows nothing at all when signed out: there is no account for a mark to
 * belong to, and offering a control that only leads to a sign-in page is worse
 * than not offering it.
 *
 * `tone` picks a palette for the places that sit on a wallpaper colour rather
 * than on a themed surface — the player bar and the spotlight — where the
 * slate scale would invert with the theme and disappear.
 */
export default function FavouriteButton({ track, tone = 'surface', className = '' }) {
  const { isAuthenticated } = useAuth();
  const { isFavourite, toggle } = useFavourites();
  const [busy, setBusy] = useState(false);

  if (!isAuthenticated) return null;

  const marked = isFavourite(track.id);

  async function handleClick() {
    setBusy(true);
    try {
      await toggle(track);
    } catch {
      // The context has already put the star back; nothing more to say here
      // than leaving it where it was.
    } finally {
      setBusy(false);
    }
  }

  const palette = {
    surface: marked
      ? 'text-rose-500 hover:bg-slate-100'
      : 'text-slate-300 hover:bg-slate-100 hover:text-rose-400',
    dark: marked ? 'text-rose-400 hover:bg-white/10' : 'text-white/50 hover:bg-white/10',
    light: marked ? 'text-rose-600 hover:bg-black/5' : 'text-ink/40 hover:bg-black/5',
  }[tone];

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      aria-pressed={marked}
      aria-label={marked ? `Remove ${track.title} from favourites` : `Favourite ${track.title}`}
      title={marked ? 'In your favourites' : 'Add to favourites'}
      className={`shrink-0 rounded-md p-2 transition-colors disabled:opacity-60 ${palette} ${className}`}
    >
      <HeartIcon filled={marked} />
    </button>
  );
}

/**
 * Filled when marked, outlined when not — so the state carries without relying
 * on the colour alone.
 */
function HeartIcon({ filled }) {
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
