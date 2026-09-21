import { createContext, useContext, useMemo, useState } from 'react';

const HeroToneContext = createContext(null);

/**
 * Carries the colour of the wallpaper currently on screen from the hero up to
 * the header, which sits outside the routed page and cannot see it otherwise.
 *
 * A null tone means "no hero here" — the header uses its default styling.
 */
export function HeroToneProvider({ children }) {
  const [tone, setTone] = useState(null);

  const value = useMemo(() => ({ tone, setTone }), [tone]);

  return <HeroToneContext.Provider value={value}>{children}</HeroToneContext.Provider>;
}

export function useHeroTone() {
  const context = useContext(HeroToneContext);
  if (!context) throw new Error('useHeroTone must be used inside a HeroToneProvider');
  return context;
}
