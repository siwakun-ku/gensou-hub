import { mediaUrl } from '../lib/api.js';
import { useWallpapers, SLIDE_MS } from '../lib/WallpaperContext.jsx';

/**
 * The hero's wallpapers, run behind the sign-in and register forms.
 *
 * Not merely the same pictures — the same slideshow. It reads the slide the
 * app as a whole is on, so arriving here from the home page continues on the
 * wallpaper that was already up, and going back finds it where it should be
 * rather than restarted.
 *
 * Shown as sharply as the hero shows them. What keeps the form legible over
 * them is the scrim below and the panel's own backing, not a softening of the
 * picture.
 *
 * Fixed to the viewport rather than laid out in the page: it has no height of
 * its own to give, and a short form should still sit on a full screen of it.
 */
export default function AuthBackdrop() {
  const { slides, count, index } = useWallpapers();

  return (
    <div
      aria-hidden="true"
      style={{ '--hero-slide-ms': `${SLIDE_MS}ms` }}
      /*
       * z-0, not a negative z-index. The layout's root is a plain block with
       * `bg-canvas` on it, and a non-positioned block paints its background
       * *after* any negatively-stacked descendants — so at -z-10 this sat
       * behind the page's own background colour and never showed at all.
       *
       * At z-0 it paints with the positioned content instead; the card above
       * carries `relative z-10` to stay over it, and the header and player bar
       * already out-rank it.
       */
      className="fixed inset-0 z-0 overflow-hidden bg-ink-deep"
    >
      {count === 0 ? (
        /* No wallpapers uploaded, or the request failed: a deliberate wash
           rather than a bare panel. */
        <div className="size-full bg-gradient-to-br from-brand-700 via-brand-900 to-ink-deep" />
      ) : (
        /*
         * No blur, and so no overscale either: the oversizing only ever existed
         * to push a blur's soft edges outside the clip, and without one it would
         * just crop the wallpaper for nothing. Each slide fills the frame at its
         * own size, exactly as the hero shows it.
         */
        <div className="absolute inset-0">
          {slides.map((slide, position) => (
            <div
              key={slide.id}
              // All slides stay mounted and crossfade, exactly as in the hero.
              className={`absolute inset-0 transition-opacity duration-700 ${
                position === index ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <img
                src={mediaUrl(slide.imageUrl)}
                alt=""
                loading={position === 0 ? 'eager' : 'lazy'}
                className={`hero-zoom size-full object-cover ${
                  position === index ? 'hero-zoom-active' : ''
                }`}
              />
            </div>
          ))}
        </div>
      )}

      {/* Holds the whole range down so the card reads against it whatever
          happens to be on screen — a pale wallpaper as much as a dark one. */}
      <div className="absolute inset-0 bg-ink-deep/50" />
    </div>
  );
}
