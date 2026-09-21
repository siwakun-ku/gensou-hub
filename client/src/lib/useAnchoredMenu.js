import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

const MENU_GAP = 6;
const VIEWPORT_MARGIN = 8;

/**
 * A menu pinned to its button, rendered outside the tree it belongs to.
 *
 * Every menu in the app has the same problem: the thing it drops out of clips
 * it, or out-ranks it. The header is `sticky z-10`, which makes it a stacking
 * context — so a menu inside it cannot climb above the player bar at `z-20`
 * however high its own z-index goes. Track lists clip their corners with
 * `overflow-hidden`, and clipping is not something a stacking order can escape
 * at all.
 *
 * The answer in both cases is to leave: the menu renders into <body> through a
 * portal and is positioned in viewport coordinates instead. This hook is the
 * measuring and dismissing half of that; the caller renders the portal.
 *
 * Returns refs for the button and the menu, the coordinates to place it at, and
 * `place()` for callers whose menu changes height while open.
 */
export function useAnchoredMenu({ open, onClose, width }) {
  const anchorRef = useRef(null);
  const menuRef = useRef(null);
  const [coords, setCoords] = useState(null);

  /**
   * Falls back to an estimated height on the first pass, before there is a menu
   * to measure, and is corrected below once there is.
   */
  const place = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    const rect = anchor.getBoundingClientRect();
    const height = menuRef.current?.offsetHeight ?? 280;

    // Below the button, unless that would run off the bottom of the window.
    let top = rect.bottom + MENU_GAP;
    if (top + height > window.innerHeight - VIEWPORT_MARGIN) {
      top = Math.max(VIEWPORT_MARGIN, rect.top - height - MENU_GAP);
    }

    // Right edges aligned, kept inside the window on a narrow screen.
    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, rect.right - width),
      window.innerWidth - width - VIEWPORT_MARGIN
    );

    setCoords({ top, left });
  }, [width]);

  // Re-measure once the menu is on screen. A layout effect, so the correction
  // never reaches paint.
  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event) => {
      // The menu is no longer inside the button's wrapper, so both count as
      // "inside" for the purpose of dismissing.
      if (anchorRef.current?.contains(event.target)) return;
      if (menuRef.current?.contains(event.target)) return;
      onClose();
    };
    const onKeyDown = (event) => event.key === 'Escape' && onClose();
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
  }, [open, onClose, place]);

  return { anchorRef, menuRef, coords, place };
}

/** The style a portalled menu is placed with, given what the hook measured. */
export function menuStyle(coords, width) {
  return { top: coords?.top ?? 0, left: coords?.left ?? 0, width };
}

/**
 * Above the header, the player bar and anything a page stacks — it is the thing
 * the listener just asked to see.
 */
export const MENU_CLASS =
  'fixed z-50 overflow-hidden rounded-lg border border-slate-200 bg-surface shadow-xl';
