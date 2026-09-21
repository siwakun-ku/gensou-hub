import { useState } from 'react';
import { mediaUrl } from '../lib/api.js';

/**
 * A circle's logo, with a generated mark when it has none.
 *
 * Most circles in the directory have no profile at all, so the fallback is the
 * common case rather than the error case — it is built to look deliberate
 * beside the ones that do.
 */
export default function CircleLogo({ circle, className = '', letterClass = 'text-2xl' }) {
  const [failed, setFailed] = useState(false);
  const src = mediaUrl(circle.logoUrl);

  if (!src || failed) {
    return (
      <div
        className={`flex items-center justify-center bg-gradient-to-br from-slate-400 to-slate-600 text-white ${className}`}
        aria-hidden="true"
      >
        {/*
         * The initial has to be sized by whoever placed the mark: this renders
         * anywhere from a 16-unit thumbnail to the top of a card, and a font
         * size that suits one looks lost or cramped in the other.
         */}
        <span className={`select-none font-bold opacity-90 ${letterClass}`}>
          {circle.name?.[0]?.toUpperCase() ?? '?'}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={`${circle.name} logo`}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`object-cover ${className}`}
    />
  );
}
