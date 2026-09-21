import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import CoverArt from './CoverArt.jsx';
import { creditLine } from './TrackMeta.jsx';
import { recommendationsApi, mediaUrl } from '../lib/api.js';
import { circlePath } from '../lib/paths.js';
import { formatDuration } from '../lib/format.js';
import { useHeroTone } from '../lib/HeroToneContext.jsx';
import { usePlayer } from '../lib/PlayerContext.jsx';

/** What the panel wears when there is no hero on the page to take a colour from. */
const DEFAULT_TONE = { background: 'rgb(15 23 42)', isDark: true };

/**
 * The spotlight under the hero: one track, given the room to be an event.
 *
 * It wears the same colour as the header and the player bar — the tone the hero
 * publishes for whatever wallpaper is on screen — so the three of them move
 * together as the slides change, and the page reads as one surface rather than
 * as a header, a card and a bar that happen to be stacked.
 *
 * Unlike the header, this does not stop borrowing the colour once the page is
 * scrolled. The header reverts because it is sticky and ends up over content it
 * has to stay legible against; this panel scrolls away with the hero it belongs
 * to, and blinking back to grey on the way out would only draw the eye.
 */
export default function RecommendedTracks() {
  const [items, setItems] = useState([]);
  const [mode, setMode] = useState(null);
  const [loading, setLoading] = useState(true);
  const { tone: heroTone } = useHeroTone();
  const { current, isPlaying, play } = usePlayer();

  useEffect(() => {
    let cancelled = false;

    recommendationsApi
      .list()
      .then((data) => {
        if (cancelled) return;
        setItems(data.items);
        setMode(data.mode);
      })
      // A failure here must not take the album grid down with it.
      .catch(() => !cancelled && setItems([]))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, []);

  // Nothing configured and nothing to suggest — leave the page alone.
  if (!loading && items.length === 0) return null;

  // The queue is the whole strip, even though only its head is on screen.
  const queue = { id: 'recommended', title: 'Recommended', tracks: items };
  const item = items[0];
  const isCurrent = current?.track.id === item?.id;
  const playing = isCurrent && isPlaying;

  const tone = heroTone ?? DEFAULT_TONE;
  const onDark = tone.isDark;

  // A pale wallpaper gives a pale panel, so everything on it has to turn over
  // with the tone, exactly as the header's links and the player's controls do.
  const shading = onDark
    ? 'from-ink-deep/85 via-ink-deep/55 to-ink-deep/20'
    : 'from-white/90 via-white/65 to-white/25';

  // The chips that go somewhere. Shared so the album and the circle read as a
  // matched pair rather than as one control and something that resembles it.
  const linkChip = `inline-flex max-w-full items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition ${
    onDark
      ? 'bg-white/10 text-white/90 ring-white/15 hover:bg-white/20'
      : 'bg-black/5 text-ink/80 ring-black/10 hover:bg-black/10'
  }`;

  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="flex items-center gap-2.5 text-lg font-semibold">
          <LiveDot />
          Trending now
        </h2>
        {mode === 'random' && (
          <span className="text-xs text-slate-400">A fresh pick each visit</span>
        )}
      </div>

      {loading ? (
        <div className="h-64 animate-pulse rounded-3xl bg-slate-200 sm:h-56" />
      ) : (
        <article
          className="relative isolate overflow-hidden rounded-3xl shadow-xl transition-colors duration-700"
          // The wallpaper's colour cannot be a utility class, so it is set
          // inline and transitioned by the class above — the same arrangement
          // the header uses.
          style={{ backgroundColor: tone.background }}
        >
          {/* The artwork, vastly blurred, as texture over the tone. Kept faint
              so the panel still reads as the same colour as the header rather
              than as a picture that happens to be nearby. */}
          {item.coverUrl && (
            <img
              src={mediaUrl(item.coverUrl)}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 size-full scale-125 object-cover opacity-25 blur-3xl"
            />
          )}
          <div className={`absolute inset-0 bg-gradient-to-r ${shading}`} />

          <div className="relative flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:gap-8 sm:p-8">
            <Link
              to={`/albums/${item.albumId}`}
              title={item.albumTitle}
              className="group/art relative shrink-0 self-start sm:self-auto"
            >
              <CoverArt
                album={{ coverUrl: item.coverUrl, title: item.albumTitle }}
                className={`size-32 rounded-2xl shadow-2xl ring-1 transition duration-300 group-hover/art:scale-[1.03] sm:size-44 ${
                  onDark ? 'ring-white/15' : 'ring-black/10'
                }`}
              />
              {playing && <Equalizer onDark={onDark} />}
            </Link>

            <div className="min-w-0 flex-1 space-y-3">
              <p
                className={`text-[11px] font-semibold uppercase tracking-[0.2em] ${
                  onDark ? 'text-white/55' : 'text-ink/55'
                }`}
              >
                Track of the moment
              </p>

              <div className="min-w-0 space-y-1">
                <h3
                  className={`truncate text-3xl font-bold sm:text-4xl ${
                    onDark ? 'text-white' : 'text-ink'
                  }`}
                  title={item.title}
                >
                  {item.title}
                </h3>
                <p className={`truncate text-base ${onDark ? 'text-white/75' : 'text-ink/80'}`}>
                  {creditLine(item)}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/*
                 * Two chips, not one. They were a single "Album — Circle" pill
                 * that could only lead to the album, which made the circle look
                 * like part of the album's name rather than the group that put
                 * it out. Split, each half goes to its own source.
                 *
                 * The circle is shown even when it is also the credit line
                 * above — that line is text, this is the way to the circle.
                 */}
                <Link
                  to={`/albums/${item.albumId}`}
                  title={`Album: ${item.albumTitle}`}
                  className={linkChip}
                >
                  <DiscIcon />
                  <span className="truncate">{item.albumTitle}</span>
                </Link>

                {item.albumCircle && (
                  <Link
                    to={circlePath(item.albumCircle)}
                    title={`Circle: ${item.albumCircle}`}
                    className={linkChip}
                  >
                    <CircleIcon />
                    <span className="truncate">{item.albumCircle}</span>
                  </Link>
                )}

                {[
                  item.year,
                  item.trackNumber && `Track ${item.trackNumber}`,
                  item.duration > 0 && formatDuration(item.duration),
                ]
                  .filter(Boolean)
                  .map((chip) => (
                    <span
                      key={chip}
                      className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${
                        onDark ? 'text-white/70 ring-white/15' : 'text-ink/70 ring-black/10'
                      }`}
                    >
                      {chip}
                    </span>
                  ))}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              <button
                onClick={() => play(item, queue)}
                aria-label={playing ? `Pause ${item.title}` : `Play ${item.title}`}
                className={`flex items-center gap-2.5 rounded-full px-6 py-3.5 text-sm font-semibold shadow-lg transition hover:scale-[1.03] active:scale-100 ${
                  onDark
                    ? 'bg-white text-ink hover:bg-white/90'
                    : 'bg-ink text-white hover:bg-ink/90'
                }`}
              >
                {playing ? <PauseIcon /> : <PlayIcon />}
                {playing ? 'Pause' : 'Play'}
              </button>

              <a
                href={mediaUrl(item.downloadUrl)}
                download
                title={`Download ${item.title}`}
                aria-label={`Download ${item.title}`}
                className={`flex size-12 items-center justify-center rounded-full ring-1 ring-inset transition ${
                  onDark
                    ? 'text-white/70 ring-white/25 hover:bg-white/10 hover:text-white'
                    : 'text-ink/70 ring-black/15 hover:bg-black/5 hover:text-ink'
                }`}
              >
                <DownloadIcon />
              </a>
            </div>
          </div>
        </article>
      )}
    </section>
  );
}

/** A quiet heartbeat beside the heading. */
function LiveDot() {
  return (
    <span className="relative flex size-2.5">
      <span className="rec-ping absolute inline-flex size-full rounded-full bg-brand-500" />
      <span className="relative inline-flex size-2.5 rounded-full bg-brand-600" />
    </span>
  );
}

/** Shown over the artwork only while this track is the one playing. */
function Equalizer({ onDark }) {
  return (
    <span
      aria-hidden="true"
      className={`absolute bottom-3 left-3 flex h-5 items-end gap-1 rounded-md px-2 py-1.5 backdrop-blur-sm ${
        onDark ? 'bg-ink-deep/55' : 'bg-white/70'
      }`}
    >
      {[0, 150, 300, 450].map((delay) => (
        <span
          key={delay}
          style={{ animationDelay: `${delay}ms` }}
          className={`rec-bar block h-full w-1 rounded-full ${
            onDark ? 'bg-white' : 'bg-ink'
          }`}
        />
      ))}
    </span>
  );
}

/*
 * The two chips carry nothing but a name, and a record's title and its circle's
 * name look alike. A glyph on each says which is which without a label eating
 * the width.
 */
const chipIconProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  className: 'size-3.5 shrink-0',
};

/** A record, for the album. */
function DiscIcon() {
  return (
    <svg {...chipIconProps}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

/** A group of people, for the circle that released it. */
function CircleIcon() {
  return (
    <svg {...chipIconProps}>
      <path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20" />
      <circle cx="10" cy="8" r="3.5" />
      <path d="M20 20v-1.5a3.5 3.5 0 0 0-2.6-3.4M15.5 4.6a3.5 3.5 0 0 1 0 6.8" />
    </svg>
  );
}

const iconProps = {
  className: 'size-5',
  viewBox: '0 0 24 24',
  fill: 'currentColor',
  'aria-hidden': true,
};

function PlayIcon() {
  return (
    <svg {...iconProps}>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg {...iconProps}>
      <path d="M7 5h3v14H7zM14 5h3v14h-3z" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-5"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </svg>
  );
}
