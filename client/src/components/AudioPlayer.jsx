import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import CoverArt from './CoverArt.jsx';
import { mediaUrl } from '../lib/api.js';
import { formatDuration } from '../lib/format.js';
import { usePlayer } from '../lib/PlayerContext.jsx';
import { creditLine } from './TrackMeta.jsx';
import FavouriteButton from './FavouriteButton.jsx';

/**
 * Transport icons drawn inline rather than as ⏮/▶/⏭ characters: those render as
 * colour emoji on some platforms, which ignores the button's own text colour.
 */
function Icon({ children }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="size-[55%]">
      {children}
    </svg>
  );
}

const PreviousIcon = () => (
  <Icon>
    <path d="M7 5h2.5v14H7zM20 5v14L9.5 12z" />
  </Icon>
);

const NextIcon = () => (
  <Icon>
    <path d="M14.5 5H17v14h-2.5zM4 5l10.5 7L4 19z" />
  </Icon>
);

const PlayIcon = () => (
  <Icon>
    <path d="M7 4.5 20 12 7 19.5z" />
  </Icon>
);

/** The dot under an active toggle — the state is not colour alone. */
const ActiveDot = () => (
  <span className="absolute inset-x-0 -bottom-0.5 mx-auto size-1 rounded-full bg-current" />
);

const ShuffleIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className="size-4"
  >
    <path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
  </svg>
);

const RepeatIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className="size-4"
  >
    <path d="m17 2 4 4-4 4M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v1a4 4 0 0 1-4 4H3" />
  </svg>
);

/** The repeat arrows with a 1 in the middle, for repeat-one. */
const RepeatOneIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
    <path
      d="m17 2 4 4-4 4M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v1a4 4 0 0 1-4 4H3"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <text
      x="12"
      y="15.5"
      textAnchor="middle"
      fill="currentColor"
      fontSize="9"
      fontWeight="700"
    >
      1
    </text>
  </svg>
);

const PauseIcon = () => (
  <Icon>
    <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />
  </Icon>
);

/**
 * Sticky playback bar. Rendered once, in the layout, so it survives routing.
 *
 * `tone` is the wallpaper colour the header is currently wearing, or null when
 * the header is in its default state — the bar mirrors it either way.
 */
export default function AudioPlayer({ tone = null }) {
  const {
    audioRef,
    current,
    isPlaying,
    setIsPlaying,
    playNext,
    repeat,
    cycleRepeat,
    shuffle,
    toggleShuffle,
  } = usePlayer();
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);

  // Autoplay whenever the selected track changes.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    audio.play().catch(() => setIsPlaying(false));
  }, [current, audioRef, setIsPlaying]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume, audioRef]);

  function seek(event) {
    const value = Number(event.target.value);
    setProgress(value);
    if (audioRef.current) audioRef.current.currentTime = value;
  }

  const track = current?.track;

  // Every track carries its own album's title and artwork, so the cover on the
  // bar is the cover of whatever is playing — whether it was queued from an
  // album page, a playlist, or the recommendation strip, which are not all one
  // album to begin with.
  const source = track && {
    id: track.albumId,
    title: track.albumTitle,
    coverUrl: track.coverUrl,
  };
  // The element must stay mounted so playback is not torn down between routes.
  const hidden = !current;

  const tinted = Boolean(tone);
  const onDarkTint = tinted && tone.isDark;

  /*
   * While the bar wears a wallpaper's colour it is outside the theme — a pale
   * wallpaper is pale in either mode — so anything sitting on it uses `ink` and
   * `white`, which do not move between themes. The slate scale inverts, and a
   * slate label on a pale wallpaper would turn white in dark mode and vanish.
   * Only the untinted bar, an ordinary surface, follows the theme.
   */
  const onTint = (dark, pale, plain) => (onDarkTint ? dark : tinted ? pale : plain);

  // All three transport buttons share one filled-circle design — black icon on
  // white — and differ only in diameter, so play stays the primary action. The
  // disc is white in every case, so its icon is always the fixed ink; the ring
  // is what keeps it visible when the bar behind it is pale too.
  const controlClass = (size) =>
    `flex ${size} items-center justify-center rounded-full bg-white text-ink transition-colors hover:bg-slate-100 ${onTint(
      '',
      'ring-1 ring-black/15',
      'ring-1 ring-slate-300'
    )}`;
  const timeClass = `text-xs tabular-nums transition-colors ${onTint(
    'text-white/75',
    'text-ink/70',
    'text-slate-500'
  )}`;
  const accent = onDarkTint ? 'accent-white' : 'accent-brand-600';

  // Shuffle and repeat are toggles, not transport: they read as plain icons and
  // light up when on, rather than sitting in white discs like play and skip.
  const toggleClass = (on) =>
    `relative rounded-md p-2 transition-colors ${
      on
        ? onTint('text-white', 'text-ink', 'text-brand-600')
        : onTint(
            'text-white/50 hover:text-white/80',
            'text-ink/45 hover:text-ink/75',
            'text-slate-400 hover:text-slate-600'
          )
    }`;

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-20 border-t transition-[transform,background-color,border-color] duration-500 ${
        hidden ? 'translate-y-full' : 'translate-y-0'
      } ${tinted ? 'border-transparent' : 'border-slate-200 bg-surface/95 backdrop-blur'}`}
      // Same as the header: the sampled colour cannot be a utility class.
      style={tinted ? { backgroundColor: tone.background } : undefined}
    >
      <audio
        ref={audioRef}
        src={track ? mediaUrl(track.streamUrl) : undefined}
        preload="metadata"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || track?.duration || 0)}
        onEnded={() => playNext(1, { auto: true })}
      />

      <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
        {source && (
          <Link to={`/albums/${source.id}`} className="shrink-0">
            <CoverArt album={source} className="size-12 rounded-md" />
          </Link>
        )}

        <div className="w-40 min-w-0 shrink-0">
          <p
            className={`truncate text-sm font-semibold transition-colors ${
              onDarkTint ? 'text-white' : tinted ? 'text-ink' : 'text-slate-900'
            }`}
          >
            {track?.title}
          </p>
          <p
            className={`truncate text-xs transition-colors ${
              onDarkTint ? 'text-white/75' : tinted ? 'text-ink/70' : 'text-slate-500'
            }`}
          >
            {track ? creditLine(track) : ''}
          </p>
        </div>

        {track && (
          <FavouriteButton
            track={track}
            tone={onTint('dark', 'light', 'surface')}
            className="hidden sm:block"
          />
        )}

        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={toggleShuffle}
            aria-label="Shuffle"
            aria-pressed={shuffle}
            title={shuffle ? 'Shuffle on' : 'Shuffle off'}
            className={toggleClass(shuffle)}
          >
            <ShuffleIcon />
            {shuffle && <ActiveDot />}
          </button>

          <button
            onClick={() => playNext(-1)}
            aria-label="Previous track"
            className={controlClass('size-8')}
          >
            <PreviousIcon />
          </button>
          <button
            onClick={() => {
              const audio = audioRef.current;
              if (audio?.paused) audio.play();
              else audio?.pause();
            }}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            className={controlClass('size-9')}
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button
            onClick={() => playNext(1)}
            aria-label="Next track"
            className={controlClass('size-8')}
          >
            <NextIcon />
          </button>

          <button
            onClick={cycleRepeat}
            aria-label="Repeat"
            aria-pressed={repeat !== 'off'}
            title={
              repeat === 'one'
                ? 'Repeat this track'
                : repeat === 'all'
                  ? 'Repeat the queue'
                  : 'Repeat off'
            }
            className={toggleClass(repeat !== 'off')}
          >
            {repeat === 'one' ? <RepeatOneIcon /> : <RepeatIcon />}
            {repeat !== 'off' && <ActiveDot />}
          </button>
        </div>

        <div className="flex flex-1 items-center gap-2">
          <span className={`w-10 text-right ${timeClass}`}>{formatDuration(progress)}</span>
          <input
            type="range"
            min={0}
            max={duration || 0}
            value={progress}
            onChange={seek}
            aria-label="Seek"
            className={`h-1 flex-1 cursor-pointer ${accent}`}
          />
          <span className={`w-10 ${timeClass}`}>{formatDuration(duration)}</span>
        </div>

        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          aria-label="Volume"
          className={`hidden h-1 w-20 cursor-pointer sm:block ${accent}`}
        />

        {track && (
          <a
            href={mediaUrl(track.downloadUrl)}
            download
            className={`hidden shrink-0 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors md:block ${
              onDarkTint
                ? 'border-white/40 text-white hover:bg-white/10'
                : tinted
                  ? 'border-black/20 text-ink/80 hover:bg-black/5'
                  : 'border-slate-300 text-slate-600 hover:bg-slate-50'
            }`}
          >
            Download
          </a>
        )}
      </div>
    </div>
  );
}
