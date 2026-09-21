import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { wallpapersApi } from './api.js';

/** How long each slide holds, everywhere it is shown. */
export const SLIDE_MS = 6000;

const WallpaperContext = createContext(null);

/**
 * The wallpapers, and which one is showing — for the whole app at once.
 *
 * The hero on the home page and the backdrop behind the sign-in forms are two
 * views of one slideshow, not two slideshows that happen to share a source.
 * Held here, the clock keeps running across a navigation: going from the home
 * page to sign in picks up on the slide that was already on screen instead of
 * snapping back to the first one.
 *
 * It also means the list is fetched once rather than once per page that shows
 * it, and a manual click on the hero's arrows moves the state everything reads.
 */
export function WallpaperProvider({ children }) {
  const [slides, setSlides] = useState([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;

    wallpapersApi
      .list()
      .then((data) => !cancelled && setSlides(data))
      // Decoration everywhere it appears: a failure means no pictures, never a
      // broken page.
      .catch(() => !cancelled && setSlides([]));

    return () => {
      cancelled = true;
    };
  }, []);

  const count = slides.length;

  /*
   * Advance on a timer, restarting the clock whenever the slide changes so a
   * manual click gets a full interval rather than the tail of the last one.
   *
   * This runs whether or not anything is currently showing the slides, which is
   * the point: the state carries on between the pages that do.
   */
  useEffect(() => {
    if (count <= 1) return;

    // Someone who asked for less motion gets a static first slide.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const timer = setTimeout(() => setIndex((i) => (i + 1) % count), SLIDE_MS);
    return () => clearTimeout(timer);
  }, [index, count]);

  // Keep the index valid if slides are retired while the app is open.
  useEffect(() => {
    if (count > 0 && index >= count) setIndex(0);
  }, [index, count]);

  /** Jump to a slide, wrapping at either end. */
  const go = useCallback(
    (next) => {
      if (count === 0) return;
      setIndex(((next % count) + count) % count);
    },
    [count]
  );

  const value = useMemo(() => ({ slides, count, index, go }), [slides, count, index, go]);

  return <WallpaperContext.Provider value={value}>{children}</WallpaperContext.Provider>;
}

export function useWallpapers() {
  const context = useContext(WallpaperContext);
  if (!context) throw new Error('useWallpapers must be used inside a WallpaperProvider');
  return context;
}
