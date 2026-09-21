/** 214 -> "3:34", 0 or unknown -> "--:--" */
export function formatDuration(seconds) {
  if (!seconds || seconds < 0) return '--:--';
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${minutes}:${String(secs).padStart(2, '0')}`;
}

/**
 * Accepts "3:34", "1:02:03" or a plain number of seconds and returns seconds.
 * Returns null when the text cannot be read as a duration.
 */
export function parseDuration(value) {
  const text = String(value ?? '').trim();
  if (!text) return 0;

  const parts = text.split(':');
  if (parts.some((part) => part === '' || Number.isNaN(Number(part)))) return null;
  if (parts.length > 3) return null;

  return parts.reduce((total, part) => total * 60 + Number(part), 0);
}

export function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** index;
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

/** Read a local audio file's duration so the user does not have to type it. */
export function readAudioDuration(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const cleanup = () => URL.revokeObjectURL(url);

    audio.addEventListener('loadedmetadata', () => {
      const duration = Number.isFinite(audio.duration) ? Math.round(audio.duration) : 0;
      cleanup();
      resolve(duration);
    });
    audio.addEventListener('error', () => {
      cleanup();
      resolve(0);
    });

    audio.src = url;
  });
}
