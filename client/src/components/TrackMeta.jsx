/**
 * Everyone credited on a track, as one readable string.
 *
 * The contributing artists are the credit for the track itself. With none, the
 * circle that released the album speaks for it, which is the usual case on a
 * doujin record — so a track always names somebody.
 */
export function creditLine(track) {
  if (track.contributingArtists?.length) return track.contributingArtists.join(', ');
  return track.albumCircle || '';
}

/**
 * An album named alongside the circle that released it.
 *
 * The circle is dropped when it is already the credit standing next to it —
 * which is every track with no contributors of its own, and most of a doujin
 * record. Repeating it there would say the same name twice in one line.
 */
export function albumLine(track, credits = creditLine(track)) {
  if (!track.albumTitle) return '';
  if (!track.albumCircle || track.albumCircle === credits) return track.albumTitle;

  return `${track.albumTitle} — ${track.albumCircle}`;
}

/**
 * The line of information under a track title: who played it, what it came
 * from and who put that out, when, and where it sits on the record.
 *
 * Every list that shows a track uses this, so a track reads the same on an
 * album page as it does in a playlist.
 */
export default function TrackMeta({ track, showAlbum = true, className = '' }) {
  const credits = creditLine(track);
  const parts = [
    credits,
    showAlbum && albumLine(track, credits),
    track.year,
    track.trackNumber && `Track ${track.trackNumber}`,
  ].filter(Boolean);

  if (parts.length === 0) return null;

  return (
    <p className={`truncate text-xs text-slate-400 ${className}`} title={parts.join(' · ')}>
      {parts.join(' · ')}
    </p>
  );
}
