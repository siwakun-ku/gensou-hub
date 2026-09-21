import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import AudioPlayer from './AudioPlayer.jsx';
import AdminMenu from './AdminMenu.jsx';
import ThemeMenu from './ThemeMenu.jsx';
import { useAuth } from '../lib/AuthContext.jsx';
import { useHeroTone } from '../lib/HeroToneContext.jsx';

// How far down the page the header stops borrowing the wallpaper's colour.
const TONE_UNTIL = 120;

export default function Layout() {
  const { user, isAdmin, logout } = useAuth();
  const { tone } = useHeroTone();
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const headerRef = useRef(null);

  // Publish the header's measured height so a full-height hero can fill exactly
  // the rest of the viewport without a hardcoded magic number.
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    const publish = () =>
      document.documentElement.style.setProperty(
        '--header-height',
        `${header.getBoundingClientRect().height}px`
      );

    publish();

    const observer = new ResizeObserver(publish);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > TONE_UNTIL);

    onScroll(); // the page may already be scrolled on a back navigation
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  function handleLogout() {
    logout();
    navigate('/', { replace: true });
  }

  // Tinted only while a hero is on screen and the page is near the top.
  const tinted = Boolean(tone) && !scrolled;
  const onDarkTint = tinted && tone.isDark;

  /*
   * While the bar wears a wallpaper's colour it is outside the theme: the
   * wallpaper is as pale or as deep as it is whether the app is in light mode
   * or dark. So the text on it uses `ink` and `white`, which mean the same
   * thing in both themes, rather than the slate scale, which inverts — a
   * slate-900 label on a pale wallpaper turns white in dark mode and vanishes.
   *
   * Only the untinted case, where the bar is an ordinary surface, follows the
   * theme.
   */

  const linkClass = ({ isActive }) => {
    const base = 'rounded-md px-3 py-2 text-sm font-medium transition-colors';

    if (isActive) {
      return `${base} ${
        onDarkTint ? 'bg-white/20 text-white' : tinted ? 'bg-black/10 text-ink' : 'bg-brand-600 text-white'
      }`;
    }

    return `${base} ${
      onDarkTint
        ? 'text-white/80 hover:bg-white/10 hover:text-white'
        : tinted
          ? 'text-ink/80 hover:bg-black/5'
          : 'text-slate-600 hover:bg-slate-100'
    }`;
  };

  return (
    <div className="min-h-screen bg-canvas text-slate-900">
      <header
        ref={headerRef}
        className={`sticky top-0 z-10 border-b transition-colors duration-500 ${
          tinted ? 'border-transparent' : 'border-slate-200 bg-surface/95 backdrop-blur'
        }`}
        // The wallpaper's colour cannot be a utility class, so it is set inline
        // and transitioned by the classes above.
        style={tinted ? { backgroundColor: tone.background } : undefined}
      >
        <nav className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <NavLink
            to="/"
            className={`flex items-baseline gap-2 text-lg font-semibold tracking-tight transition-colors ${
              onDarkTint ? 'text-white' : tinted ? 'text-ink' : 'text-slate-900'
            }`}
          >
            Gensou Hub
            {/* lang="ja" so the browser reaches for a Japanese face rather than
                falling back to whatever the Latin stack offers. */}
            <span
              lang="ja"
              className={`text-sm font-medium transition-colors ${
                onDarkTint ? 'text-white/75' : tinted ? 'text-ink/60' : 'text-slate-500'
              }`}
            >
              幻想-ハブ
            </span>
          </NavLink>

          <div className="flex items-center gap-1">
            <NavLink to="/" className={linkClass} end>
              Albums
            </NavLink>

            <NavLink to="/circles" className={linkClass}>
              Circles
            </NavLink>

            <NavLink to="/search" className={linkClass}>
              Search
            </NavLink>

            {/* A playlist belongs to an account, so the link only shows once
                there is one to belong to. */}
            {user && (
              <>
                <NavLink to="/favourites" className={linkClass}>
                  Favourites
                </NavLink>
                <NavLink to="/playlists" className={linkClass}>
                  Playlists
                </NavLink>
              </>
            )}

            {/* The admin pages live behind one entry, so the bar is the same
                width whoever is signed in. */}
            {isAdmin && <AdminMenu tinted={tinted} onDarkTint={onDarkTint} />}

            <ThemeMenu tinted={tinted} onDarkTint={onDarkTint} />

            {user ? (
              <div
                className={`ml-2 flex items-center gap-2 border-l pl-3 transition-colors ${
                  onDarkTint ? 'border-white/25' : tinted ? 'border-black/15' : 'border-slate-200'
                }`}
              >
                <span
                  className={`hidden text-sm transition-colors sm:inline ${
                    onDarkTint ? 'text-white/90' : tinted ? 'text-ink/75' : 'text-slate-600'
                  }`}
                >
                  {user.name}
                  {isAdmin && (
                    <span
                      className={`ml-1.5 rounded px-1.5 py-0.5 text-xs font-semibold ${
                        onDarkTint
                          ? 'bg-white/20 text-white'
                          : tinted
                            ? 'bg-black/10 text-ink'
                            : 'bg-brand-50 text-brand-700 dark:text-brand-300'
                      }`}
                    >
                      admin
                    </span>
                  )}
                </span>
                <button onClick={handleLogout} className={linkClass({ isActive: false })}>
                  Sign out
                </button>
              </div>
            ) : (
              <div
                className={`ml-2 flex items-center gap-1 border-l pl-3 transition-colors ${
                  onDarkTint ? 'border-white/25' : tinted ? 'border-black/15' : 'border-slate-200'
                }`}
              >
                <NavLink to="/login" className={linkClass}>
                  Sign in
                </NavLink>
                <NavLink
                  to="/register"
                  className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    onDarkTint
                      ? 'bg-white text-ink hover:bg-white/90'
                      : 'bg-brand-600 text-white hover:bg-brand-700'
                  }`}
                >
                  Register
                </NavLink>
              </div>
            )}
          </div>
        </nav>
      </header>

      {/* Unconstrained so a page can go full-bleed; pages wrap their own
          content in <Container>. Bottom padding clears the sticky player. */}
      <main className="pb-28">
        <Outlet />
      </main>

      {/* The player borrows the same wallpaper tone as the header, so the two
          bars framing the page stay in step. */}
      <AudioPlayer tone={tinted ? tone : null} />
    </div>
  );
}
