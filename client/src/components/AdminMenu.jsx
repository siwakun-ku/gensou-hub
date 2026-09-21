import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useLocation } from 'react-router-dom';
import { useAnchoredMenu, menuStyle, MENU_CLASS } from '../lib/useAnchoredMenu.js';

const MENU_WIDTH = 224;

/** Everything an admin can reach that a listener cannot. */
const ADMIN_LINKS = [
  { to: '/albums/new', label: 'Add album', hint: 'Start a new record' },
  { to: '/admin/circles/new', label: 'Add circle', hint: 'Write up a group' },
  { to: '/admin/wallpapers', label: 'Wallpapers', hint: 'The slides on the home page' },
  { to: '/admin/recommendations', label: 'Recommended', hint: 'What the home page suggests' },
];

/**
 * The admin pages, behind one nav entry.
 *
 * They were three separate links competing with Albums and Playlists for room
 * in the header; collected here they read as what they are — a section only
 * some accounts have — and the bar stays the same width for everyone.
 *
 * `tinted` and `onDarkTint` come from the header, which borrows the colour of
 * whatever wallpaper is on screen. Only the button takes part in that; the
 * panel is its own surface.
 */
export default function AdminMenu({ tinted, onDarkTint }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  const close = useCallback(() => setOpen(false), []);

  /*
   * Rendered into <body> rather than under the button. The header is
   * `sticky z-10`, which makes it a stacking context, so a menu inside it can
   * never rise above the player bar at z-20 however high its own z-index goes.
   */
  const { anchorRef, menuRef, coords } = useAnchoredMenu({
    open,
    onClose: close,
    width: MENU_WIDTH,
  });

  const isActive = ADMIN_LINKS.some((link) => location.pathname.startsWith(link.to));

  // Following a link inside the menu should leave it closed behind you.
  useEffect(() => setOpen(false), [location.pathname]);

  // Matches the surrounding nav links, including while one of these pages is
  // the one being looked at.
  const base = 'flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium transition-colors';
  const buttonClass = isActive
    ? `${base} ${
        onDarkTint
          ? 'bg-white/20 text-white'
          : tinted
            ? 'bg-black/10 text-ink'
            : 'bg-brand-600 text-white'
      }`
    : `${base} ${
        onDarkTint
          ? 'text-white/80 hover:bg-white/10 hover:text-white'
          : tinted
            ? 'text-ink/80 hover:bg-black/5'
            : 'text-slate-600 hover:bg-slate-100'
      }`;

  const menu = (
    <div
      ref={menuRef}
      role="menu"
      style={menuStyle(coords, MENU_WIDTH)}
      className={`${MENU_CLASS} py-1`}
    >
          {ADMIN_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              role="menuitem"
              className={({ isActive: onThisPage }) =>
                `block px-3 py-2 transition-colors ${
                  onThisPage ? 'bg-brand-50' : 'hover:bg-slate-50'
                }`
              }
            >
              {({ isActive: onThisPage }) => (
                <>
                  <span
                    className={`block text-sm font-medium ${
                      onThisPage ? 'text-brand-700 dark:text-brand-300' : 'text-slate-700'
                    }`}
                  >
                    {link.label}
                  </span>
                  <span className="block text-xs text-slate-400">{link.hint}</span>
                </>
              )}
            </NavLink>
          ))}
    </div>
  );

  return (
    <div className="relative">
      <button
        ref={anchorRef}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={buttonClass}
      >
        Admin
        <ChevronIcon open={open} />
      </button>

      {open && createPortal(menu, document.body)}
    </div>
  );
}

function ChevronIcon({ open }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`size-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
