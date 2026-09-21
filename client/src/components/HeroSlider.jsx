import { useCallback, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { mediaUrl } from '../lib/api.js';
import { averageColor, toneFrom } from '../lib/color.js';
import { useHeroTone } from '../lib/HeroToneContext.jsx';
import { useWallpapers, SLIDE_MS } from '../lib/WallpaperContext.jsx';

/**
 * Full-bleed hero that cycles through the wallpapers an admin has uploaded, and
 * publishes the current slide's colour so the header can match it.
 *
 * Which slide is showing is app-wide state rather than this component's own:
 * the sign-in backdrop is the same slideshow seen from another page, and the
 * two would drift apart if each kept its own clock. The arrows and dots below
 * move that shared state, so a click here is still on screen after navigating
 * away and back.
 *
 * Renders nothing at all when there are no wallpapers, so the page just starts
 * with the album grid.
 */
export default function HeroSlider() {
  const { slides, count, index, go } = useWallpapers();

  const imageRefs = useRef({});
  // Sampling an image is cheap but not free, and slides repeat as it loops.
  const toneCache = useRef({});

  const { setTone } = useHeroTone();

  const publishTone = useCallback(
    (slideId) => {
      if (!slideId) return;

      if (toneCache.current[slideId] !== undefined) {
        setTone(toneCache.current[slideId]);
        return;
      }

      const image = imageRefs.current[slideId];
      // Sampling an image that has not decoded yet yields nothing; the img's
      // onLoad handler calls back in.
      if (!image?.complete || image.naturalWidth === 0) return;

      const tone = toneFrom(averageColor(image));
      toneCache.current[slideId] = tone;
      setTone(tone);
    },
    [setTone]
  );

  // Match the header to whichever slide is showing.
  useEffect(() => {
    publishTone(slides[index]?.id);
  }, [index, slides, publishTone]);

  // Hand the header back its default look when the hero leaves the page.
  useEffect(() => () => setTone(null), [setTone]);

  // The timer, the wrapping and the bounds check all live in the provider now,
  // so that one clock drives every view of these slides.
  if (count === 0) return null;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured"
      style={{ '--hero-slide-ms': `${SLIDE_MS}ms` }}
      className="hero-full group relative w-full overflow-hidden bg-ink"
    >
      {slides.map((slide, position) => (
        <div
          key={slide.id}
          // All slides stay mounted and crossfade, so the browser has already
          // decoded the next image before it is shown.
          className={`absolute inset-0 transition-opacity duration-700 ${
            position === index ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
          aria-hidden={position !== index}
        >
          <img
            ref={(element) => {
              imageRefs.current[slide.id] = element;
            }}
            src={mediaUrl(slide.imageUrl)}
            alt={slide.title || 'Featured wallpaper'}
            loading={position === 0 ? 'eager' : 'lazy'}
            onLoad={() => {
              if (slides[index]?.id === slide.id) publishTone(slide.id);
            }}
            className={`hero-zoom size-full object-cover ${
              position === index ? 'hero-zoom-active' : ''
            }`}
          />

          {(slide.title || slide.subtitle) && (
            <>
              {/* Scrim so the caption stays readable over a bright image. The
                  text sits over the middle of the frame now, so the darkening
                  cannot just hug the bottom edge. */}
              <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/35 to-black/60" />
              {/* Sits above centre — the bottom padding lifts it off the middle
                  — and lines up with the page content below. */}
              <div className="absolute inset-0 flex items-center pb-16 sm:pb-24">
                <div className="mx-auto w-full max-w-5xl px-4">
                  {slide.title && (
                    <h2 className="text-3xl font-bold text-white drop-shadow-lg sm:text-5xl">
                      {slide.title}
                    </h2>
                  )}
                  {slide.subtitle && (
                    <p className="mt-2 max-w-2xl text-base text-white/85 sm:text-lg">
                      {slide.subtitle}
                    </p>
                  )}
                  {slide.linkUrl && (
                    <SlideLink to={slide.linkUrl}>{slide.linkLabel || 'Listen now'}</SlideLink>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      ))}

      {count > 1 && (
        <>
          <ArrowButton side="left" onClick={() => go(index - 1)} label="Previous slide" />
          <ArrowButton side="right" onClick={() => go(index + 1)} label="Next slide" />

          <div className="absolute inset-x-0 bottom-3">
            <div className="mx-auto flex max-w-5xl justify-end gap-1.5 px-4">
              {slides.map((slide, position) => (
                <button
                  key={slide.id}
                  onClick={() => go(position)}
                  aria-label={`Go to slide ${position + 1}`}
                  aria-current={position === index}
                  className={`h-1.5 rounded-full transition-all ${
                    position === index ? 'w-6 bg-white' : 'w-1.5 bg-white/50 hover:bg-white/80'
                  }`}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

/**
 * A bare domain typed into the admin form ("www.example.com") is not a valid
 * href on its own — the browser reads it as a path and lands on
 * <this site>/www.example.com. Add the scheme when there is none.
 */
function externalHref(to) {
  return /^[a-z][a-z0-9+.-]*:/i.test(to) ? to : `https://${to}`;
}

/** Internal paths route without a reload; anything else is a normal link. */
function SlideLink({ to, children }) {
  const className =
    'mt-3 inline-block rounded-md bg-white/95 px-4 py-2 text-sm font-semibold text-ink transition hover:bg-white';

  return to.startsWith('/') ? (
    <Link to={to} className={className}>
      {children}
    </Link>
  ) : (
    <a
      href={externalHref(to)}
      target="_blank"
      rel="noreferrer noopener"
      className={className}
    >
      {children}
    </a>
  );
}

function ArrowButton({ side, onClick, label }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`absolute top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-xl text-white opacity-0 transition hover:bg-black/60 focus:opacity-100 group-hover:opacity-100 sm:opacity-100 ${
        side === 'left' ? 'left-4' : 'right-4'
      }`}
    >
      {side === 'left' ? '‹' : '›'}
    </button>
  );
}
