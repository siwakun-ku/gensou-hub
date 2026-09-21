import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { favouritesApi } from './api.js';
import { useAuth } from './AuthContext.jsx';

const FavouritesContext = createContext(null);

/**
 * Which tracks this listener has marked.
 *
 * Held as a set of ids rather than asked per track: a star has to know its own
 * state, and every list in the app is a list of tracks — fetching the ids once
 * on sign-in is what lets a hundred of them render without a hundred requests.
 *
 * Signed out there is nothing to hold, and the API would refuse anyway.
 */
export function FavouritesProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [ids, setIds] = useState(() => new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      // Signing out must not leave the previous account's stars lit.
      setIds(new Set());
      return;
    }

    let cancelled = false;
    setLoading(true);

    favouritesApi
      .ids()
      .then((list) => !cancelled && setIds(new Set(list)))
      // A failure here only means no stars are lit; it must not break the page.
      .catch(() => !cancelled && setIds(new Set()))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const isFavourite = useCallback((trackId) => ids.has(trackId), [ids]);

  /**
   * Mark or unmark, whichever it is not already.
   *
   * The set moves first and is put back if the request fails: a star that waits
   * for a round trip feels broken, and the failure case is rare enough to be
   * worth correcting after the fact rather than delaying every success.
   */
  const toggle = useCallback(
    async (track) => {
      const marked = ids.has(track.id);

      setIds((current) => {
        const next = new Set(current);
        if (marked) next.delete(track.id);
        else next.add(track.id);
        return next;
      });

      try {
        if (marked) await favouritesApi.remove(track.albumId, track.id);
        else await favouritesApi.add(track.albumId, track.id);
      } catch (err) {
        setIds((current) => {
          const next = new Set(current);
          if (marked) next.add(track.id);
          else next.delete(track.id);
          return next;
        });
        throw err;
      }
    },
    [ids]
  );

  /**
   * Star a whole run of tracks at once — a record, or a chosen few.
   *
   * Not optimistic, unlike `toggle`: the server is the one that knows which of
   * these were already starred, and the reply names every track involved. The
   * set is updated from that rather than guessed at, so the count it reports
   * and the stars that light always agree.
   */
  const addMany = useCallback(async (payload) => {
    const result = await favouritesApi.addMany(payload);

    setIds((current) => {
      const next = new Set(current);
      for (const trackId of result.trackIds) next.add(trackId);
      return next;
    });

    return result;
  }, []);

  /** The other half: unstar a whole run of tracks at once. */
  const removeMany = useCallback(async (payload) => {
    const result = await favouritesApi.removeMany(payload);

    setIds((current) => {
      const next = new Set(current);
      for (const trackId of result.trackIds) next.delete(trackId);
      return next;
    });

    return result;
  }, []);

  const value = useMemo(
    () => ({ ids, count: ids.size, loading, isFavourite, toggle, addMany, removeMany }),
    [ids, loading, isFavourite, toggle, addMany, removeMany]
  );

  return <FavouritesContext.Provider value={value}>{children}</FavouritesContext.Provider>;
}

export function useFavourites() {
  const context = useContext(FavouritesContext);
  if (!context) throw new Error('useFavourites must be used inside a FavouritesProvider');
  return context;
}
