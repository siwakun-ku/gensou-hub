/**
 * Reads the tags a music file already carries — ID3 on an MP3, Vorbis comments
 * on a FLAC, atoms in an MP4 — so an admin adding a track does not retype what
 * the file has been saying about itself all along.
 */

/**
 * The parser handles every format the library accepts and is far too large to
 * sit in the main bundle for the sake of one admin-only form, so it is pulled
 * in on the first file chosen and cached by the module system after that.
 */
async function parser() {
  const { parseBlob } = await import('music-metadata');
  return parseBlob;
}

/**
 * Everyone credited on the track.
 *
 * A well-formed file lists them separately, which is what `artists` holds. When
 * it only has the single joined string, that is taken as one credit rather than
 * guessed apart: separators are not agreed on between taggers, and a name like
 * "Earth, Wind & Fire" is one artist that looks exactly like three.
 */
function creditsFrom(common) {
  const listed = (common.artists ?? []).map((name) => name.trim()).filter(Boolean);
  if (listed.length > 0) return [...new Set(listed)];

  const single = common.artist?.trim();
  return single ? [single] : [];
}

/**
 * What a local audio file says about itself, or null when it says nothing that
 * can be read — a file with no tags, or a format the parser does not know.
 *
 * Never throws: unreadable metadata is a reason to fall back to typing, not to
 * fail the upload.
 */
export async function readTrackTags(file) {
  try {
    const parseBlob = await parser();
    const { common, format } = await parseBlob(file, { duration: true, skipCovers: true });

    return {
      title: common.title?.trim() || '',
      contributingArtists: creditsFrom(common),
      album: common.album?.trim() || '',
      year: common.year ?? null,
      trackNumber: common.track?.no ?? null,
      duration: format.duration ? Math.round(format.duration) : 0,
    };
  } catch {
    return null;
  }
}
