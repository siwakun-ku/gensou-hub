import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from 'react';

import { shuffled } from './shuffle.js';

const PlayerContext = createContext(null);

const REPEAT_KEY = 'gensou-hub-repeat';
const SHUFFLE_KEY = 'gensou-hub-shuffle';

/** Off, round the whole queue, or the one track over and over. */
export const REPEAT_MODES = ['off', 'all', 'one'];

/**
 * Holds the single <audio> element for the whole app so playback survives
 * navigation between the album list and an album page.
 *
 * Repeat and shuffle are remembered across visits: they are a listening
 * preference, not a property of whatever happens to be queued.
 */
export function PlayerProvider({ children }) {
  const audioRef = useRef(null);
  const [current, setCurrent] = useState(null); // { track, album }
  const [isPlaying, setIsPlaying] = useState(false);

  const [repeat, setRepeat] = useState(() => {
    const stored = localStorage.getItem(REPEAT_KEY);
    return REPEAT_MODES.includes(stored) ? stored : 'off';
  });
  const [shuffle, setShuffle] = useState(() => localStorage.getItem(SHUFFLE_KEY) === 'true');

  // The shuffled running order, as track ids. Null while shuffle is off.
  const [shuffleOrder, setShuffleOrder] = useState(null);

  useEffect(() => localStorage.setItem(REPEAT_KEY, repeat), [repeat]);
  useEffect(() => localStorage.setItem(SHUFFLE_KEY, String(shuffle)), [shuffle]);

  const queueId = current?.album?.id ?? null;
  const queueTracks = current?.album?.tracks;

  // Draw a fresh order when shuffle goes on and whenever the queue changes
  // underneath it — a new album should not be walked in the old album's order.
  useEffect(() => {
    if (!shuffle || !queueTracks?.length) {
      setShuffleOrder(null);
      return;
    }
    setShuffleOrder(shuffled(queueTracks.map((track) => track.id)));
  }, [shuffle, queueId, queueTracks]);

  /**
   * The queue in the order it will actually be walked. Tracks added since the
   * order was drawn fall to the end rather than being dropped.
   */
  const runningOrder = useCallback(
    (album) => {
      const tracks = album?.tracks ?? [];
      if (!shuffle || !shuffleOrder) return tracks;

      const byId = new Map(tracks.map((track) => [track.id, track]));
      const known = shuffleOrder.map((id) => byId.get(id)).filter(Boolean);
      const seen = new Set(known.map((track) => track.id));

      return [...known, ...tracks.filter((track) => !seen.has(track.id))];
    },
    [shuffle, shuffleOrder]
  );

  const play = useCallback(
    (track, album) => {
      const audio = audioRef.current;
      if (!audio) return;

      if (current?.track.id === track.id) {
        if (audio.paused) audio.play();
        else audio.pause();
        return;
      }

      setCurrent({ track, album });
    },
    [current]
  );

  /**
   * Step through the queue. `auto` marks the move as the end of a track rather
   * than a press of the skip button, which is the only case where repeat-one
   * applies — a listener pressing next means next, whatever the mode says.
   */
  const playNext = useCallback(
    (offset, { auto = false } = {}) => {
      if (!current) return;
      const audio = audioRef.current;

      if (auto && repeat === 'one' && audio) {
        audio.currentTime = 0;
        audio.play().catch(() => setIsPlaying(false));
        return;
      }

      const { album } = current;
      const queue = runningOrder(album);
      const index = queue.findIndex((track) => track.id === current.track.id);
      if (index === -1) return;

      let nextIndex = index + offset;

      // Falling off either end wraps only when repeating the whole queue.
      if (nextIndex >= queue.length || nextIndex < 0) {
        if (repeat !== 'all') {
          setIsPlaying(false);
          return;
        }
        nextIndex = (nextIndex + queue.length) % queue.length;
      }

      setCurrent({ track: queue[nextIndex], album });
    },
    [current, repeat, runningOrder]
  );

  /** Cycle the repeat button: off → all → one → off. */
  const cycleRepeat = useCallback(
    () => setRepeat((mode) => REPEAT_MODES[(REPEAT_MODES.indexOf(mode) + 1) % REPEAT_MODES.length]),
    []
  );

  const toggleShuffle = useCallback(() => setShuffle((on) => !on), []);

  const value = useMemo(
    () => ({
      audioRef,
      current,
      isPlaying,
      setIsPlaying,
      play,
      playNext,
      repeat,
      setRepeat,
      cycleRepeat,
      shuffle,
      toggleShuffle,
    }),
    [current, isPlaying, play, playNext, repeat, cycleRepeat, shuffle, toggleShuffle]
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (!context) throw new Error('usePlayer must be used inside a PlayerProvider');
  return context;
}
