import { useState } from 'react';
import { mediaUrl } from '../lib/api.js';

/** Album cover with a generated fallback when the album has no artwork. */
export default function CoverArt({ album, className = '' }) {
  const [failed, setFailed] = useState(false);
  const src = mediaUrl(album.coverUrl);

  if (!src || failed) {
    return (
      <div
        className={`flex items-center justify-center bg-gradient-to-br from-brand-500 to-brand-700 text-white ${className}`}
      >
        <span className="select-none text-3xl font-bold opacity-80">
          {album.title?.[0]?.toUpperCase() ?? '?'}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={`${album.title} cover`}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`object-cover ${className}`}
    />
  );
}
