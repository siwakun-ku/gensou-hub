import { Link } from 'react-router-dom';
import CoverArt from './CoverArt.jsx';
import { formatDuration } from '../lib/format.js';

/**
 * `tabIndex` is here for the overview row, which shows a second copy of each
 * album to make its loop seamless. That copy is hidden from assistive tech, so
 * its link must be out of the tab order too.
 */
export default function AlbumCard({ album, tabIndex }) {
  return (
    <Link
      to={`/albums/${album.id}`}
      tabIndex={tabIndex}
      className="group overflow-hidden rounded-xl border border-slate-200 bg-surface transition hover:-translate-y-0.5 hover:shadow-lg"
    >
      <CoverArt album={album} className="aspect-square w-full" />
      <div className="space-y-1 p-3">
        <h3 className="truncate font-semibold group-hover:text-brand-600">{album.title}</h3>
        <p className="truncate text-sm text-slate-500">{album.circle}</p>
        <p className="text-xs text-slate-400">
          {album.year ? `${album.year} · ` : ''}
          {album.trackCount} {album.trackCount === 1 ? 'track' : 'tracks'}
          {album.totalDuration > 0 && ` · ${formatDuration(album.totalDuration)}`}
        </p>
      </div>
    </Link>
  );
}
