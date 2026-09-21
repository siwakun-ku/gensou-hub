import crypto from 'node:crypto';

/**
 * A short token that changes only when the stored file changes.
 *
 * Media URLs are addressed by document id, so replacing a cover or wallpaper
 * leaves the URL identical and a browser holding a long-lived cached copy never
 * asks for the new one. Appending this makes the URL change with the file. It
 * is a hash rather than the file name itself, which is never exposed.
 */
function fileVersion(file) {
  return crypto.createHash('sha1').update(file.fileName).digest('hex').slice(0, 8);
}

/** The album's artwork, or null when it has none. */
function coverUrlFor(album) {
  const albumId = album._id.toString();
  return album.cover ? `/api/albums/${albumId}/cover?v=${fileVersion(album.cover)}` : null;
}

/**
 * Shape an Album document for the API: hide on-disk file names and hand the
 * client ready-made URLs instead.
 */
export function serializeAlbum(album) {
  const doc = album.toJSON();

  return {
    id: doc._id.toString(),
    title: doc.title,
    circle: doc.circle,
    year: doc.year ?? null,
    genre: doc.genre,
    description: doc.description,
    trackCount: doc.trackCount,
    totalDuration: doc.totalDuration,
    coverUrl: coverUrlFor(doc),
    // Null for an empty album, so the client can hide the button rather than
    // offer a download that would 404.
    downloadUrl: doc.tracks?.length ? `/api/albums/${doc._id}/download` : null,
    tracks: (doc.tracks ?? []).map((track) => serializeTrack(track, doc)),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/**
 * Shape a track for the API.
 *
 * `album` is the document the track lives in — a track is always read through
 * its album, and carrying the album's title, circle and year along means a
 * track is self-describing wherever it ends up: an album page, a playlist, the
 * recommendation strip or the player bar. It may be a plain object from an
 * aggregation rather than a document, so only raw fields are read.
 */
export function serializeTrack(track, album) {
  const albumId = album._id.toString();

  return {
    id: track._id.toString(),
    title: track.title,
    trackNumber: track.trackNumber,
    contributingArtists: track.contributingArtists ?? [],
    duration: track.duration,
    format: track.audio.mimeType,
    size: track.audio.size,
    fileName: track.audio.originalName,
    albumId,
    albumTitle: album.title,
    albumCircle: album.circle,
    year: album.year ?? null,
    // The artwork travels with the track so the player can show a cover for
    // whatever is playing, wherever it was queued from.
    coverUrl: coverUrlFor(album),
    streamUrl: `/api/albums/${albumId}/tracks/${track._id}/stream`,
    downloadUrl: `/api/albums/${albumId}/tracks/${track._id}/download`,
  };
}

/**
 * Shape a Circle for the API.
 *
 * Both halves are optional, and that is the point. `circle` is the written
 * profile, which may not exist — a group is known to the library the moment an
 * album names it, long before anyone writes it up. `stats` is what the library
 * can see about it from the albums themselves, which is nothing at all for a
 * profile written ahead of the first release.
 *
 * At least one of the two is always present; a name that has neither is not a
 * circle, it is a typo, and the controller 404s it.
 */
export function serializeCircle(circle, stats = {}) {
  return {
    // Null when nothing is written yet: the client reads this as "there is no
    // profile to edit", and the name is what addresses it either way.
    id: circle ? circle._id.toString() : null,
    name: circle?.name ?? stats.name,
    hasProfile: Boolean(circle),
    origin: circle?.origin ?? '',
    foundedYear: circle?.foundedYear ?? null,
    description: circle?.description ?? '',
    links: (circle?.links ?? []).map((link) => ({ label: link.label, url: link.url })),
    logoUrl:
      circle?.logo && circle._id
        ? `/api/circles/${circle._id}/logo?v=${fileVersion(circle.logo)}`
        : null,
    albumCount: stats.albumCount ?? 0,
    trackCount: stats.trackCount ?? 0,
    // The span of years the library holds for this circle, so a directory entry
    // can say "2014–2021" without loading every album.
    firstYear: stats.firstYear ?? null,
    latestYear: stats.latestYear ?? null,
    createdAt: circle?.createdAt ?? null,
    updatedAt: circle?.updatedAt ?? null,
  };
}

/** Shape a Wallpaper for the API, hiding the on-disk file name. */
export function serializeWallpaper(wallpaper) {
  return {
    id: wallpaper._id.toString(),
    title: wallpaper.title,
    subtitle: wallpaper.subtitle,
    linkUrl: wallpaper.linkUrl,
    linkLabel: wallpaper.linkLabel,
    order: wallpaper.order,
    isActive: wallpaper.isActive,
    imageUrl: `/api/wallpapers/${wallpaper._id}/image?v=${fileVersion(wallpaper.image)}`,
    fileName: wallpaper.image.originalName,
    size: wallpaper.image.size,
    createdAt: wallpaper.createdAt,
    updatedAt: wallpaper.updatedAt,
  };
}



/**
 * Shape a Playlist for the API.
 *
 * `resolve(item)` turns a stored album+track pair into a playable entry, or
 * null when it has gone stale. Resolution needs the album documents, which the
 * controller loads in one query, so it is passed in rather than done here.
 */
export function serializePlaylist(playlist, resolve = () => null) {
  const tracks = playlist.items.map(resolve).filter(Boolean);

  return {
    id: playlist._id.toString(),
    name: playlist.name,
    description: playlist.description,
    // What is playable today, which can be fewer than items.length when an
    // album has been deleted out from under the playlist.
    trackCount: tracks.length,
    totalDuration: tracks.reduce((sum, track) => sum + (track.duration || 0), 0),
    // Null for an empty playlist, so the client can hide the button rather
    // than offer a download that would 404.
    downloadUrl: tracks.length ? `/api/playlists/${playlist._id}/download` : null,
    tracks,
    createdAt: playlist.createdAt,
    updatedAt: playlist.updatedAt,
  };
}
