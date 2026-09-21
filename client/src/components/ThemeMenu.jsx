import { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../lib/ThemeContext.jsx';
import { useAnchoredMenu, menuStyle, MENU_CLASS } from '../lib/useAnchoredMenu.js';

const MENU_WIDTH = 192;

const OPTIONS = [
  { value: 'light', label: 'Light', hint: 'Always the pale theme' },
  { value: 'dark', label: 'Dark', hint: 'Always the dark theme' },
  { value: 'system', label: 'System', hint: 'Follow this device' },
];

/**
 * Light or dark, with the option of leaving it to the machine.
 *
 * The trigger shows the theme currently in effect rather than the setting, so
 * someone on "System" sees a sun in the morning and a moon at night — which is
 * what they actually have.
 */
export default function ThemeMenu({ tinted, onDarkTint }) {
  const { theme, isDark, setTheme } = useTheme();
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  // Into <body>, so the header's own stacking context cannot bury it. See
  // useAnchoredMenu for why that is necessary.
  const { anchorRef, menuRef, coords } = useAnchoredMenu({
    open,
    onClose: close,
    width: MENU_WIDTH,
  });

  // Matches the nav links around it, including the header's wallpaper tint.
  const buttonClass = `rounded-md p-2 transition-colors ${
    onDarkTint
      ? 'text-white/80 hover:bg-white/10 hover:text-white'
      : tinted
        ? 'text-ink/80 hover:bg-black/5'
        : 'text-slate-600 hover:bg-slate-100'
  }`;

  const current = OPTIONS.find((option) => option.value === theme);

  const menu = (
    <div
      ref={menuRef}
      role="menu"
      style={menuStyle(coords, MENU_WIDTH)}
      className={`${MENU_CLASS} py-1`}
    >
          {OPTIONS.map((option) => (
            <button
              key={option.value}
              role="menuitemradio"
              aria-checked={theme === option.value}
              onClick={() => {
                setTheme(option.value);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left transition-colors ${
                theme === option.value ? 'bg-brand-50' : 'hover:bg-slate-100'
              }`}
            >
              <span className="min-w-0 flex-1">
                <span
                  className={`block text-sm font-medium ${
                    theme === option.value ? 'text-brand-700 dark:text-brand-300' : 'text-slate-700'
                  }`}
                >
                  {option.label}
                </span>
                <span className="block text-xs text-slate-400">{option.hint}</span>
              </span>
              {theme === option.value && <CheckIcon />}
            </button>
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
        aria-label={`Theme: ${current.label}`}
        title={`Theme: ${current.label}`}
        className={buttonClass}
      >
        {isDark ? <MoonIcon /> : <SunIcon />}
      </button>

      {open && createPortal(menu, document.body)}
    </div>
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

function SunIcon() {
  return (
    <svg {...strokeProps} className="size-4">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg {...strokeProps} className="size-4">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg {...strokeProps} className="size-4 shrink-0 text-brand-600 dark:text-brand-300">
      <path d="m20 6-11 11-5-5" />
    </svg>
  );
}
