import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const ThemeContext = createContext(null);

// Read by the inline script in index.html too, which applies the class before
// React loads. Change it in both places or a dark visitor gets a white flash.
const THEME_KEY = 'gensou-hub-theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

/** What the listener can pick. "system" follows the machine and keeps following it. */
export const THEMES = ['system', 'light', 'dark'];

function storedChoice() {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return THEMES.includes(stored) ? stored : 'system';
  } catch {
    // Private browsing, or storage turned off.
    return 'system';
  }
}

const systemPrefersDark = () => window.matchMedia?.(DARK_QUERY).matches ?? false;

/**
 * Light or dark, chosen by the listener or left to their machine.
 *
 * The choice and the result are kept apart on purpose: "system" is a standing
 * instruction, not a snapshot, so someone who picks it and later switches their
 * OS over at sunset gets the app to follow along without touching this menu
 * again.
 */
export function ThemeProvider({ children }) {
  const [choice, setChoice] = useState(storedChoice);
  const [prefersDark, setPrefersDark] = useState(systemPrefersDark);

  // Keep listening, so "system" tracks the machine rather than whatever it
  // happened to be when the page loaded.
  useEffect(() => {
    const media = window.matchMedia?.(DARK_QUERY);
    if (!media) return;

    const onChange = (event) => setPrefersDark(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const resolved = choice === 'system' ? (prefersDark ? 'dark' : 'light') : choice;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark');
  }, [resolved]);

  useEffect(() => {
    try {
      // Nothing stored means "follow the machine", which is also the default
      // for a first visit — so choosing system is the same as never choosing.
      if (choice === 'system') localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, choice);
    } catch {
      // The theme still applies for this visit; it just will not be remembered.
    }
  }, [choice]);

  const setTheme = useCallback((next) => {
    if (THEMES.includes(next)) setChoice(next);
  }, []);

  const value = useMemo(
    () => ({ theme: choice, resolved, isDark: resolved === 'dark', setTheme }),
    [choice, resolved, setTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside a ThemeProvider');
  return context;
}
