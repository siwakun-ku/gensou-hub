import { ZipArchive } from 'archiver';
import { COVERS, TRACKS, openUpload } from '../config/storage.js';

/** Strip the characters Windows and macOS refuse inside a file name. */
function sanitize(name) {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim();
}

/** The extension of a stored upload, taken from the name the user uploaded. */
function extensionOf(originalName) {
  const dot = originalName.lastIndexOf('.');
  return dot === -1 ? '' : originalName.slice(dot);
}

/**
 * What one track is called once it leaves the server — the same name whether it
 * is downloaded on its own or as part of an archive, so a listener who grabs a
 * single track later ends up with a file that sorts alongside the rest.
 *
 * `position` is what the leading number counts: the track number inside an
 * album, or the running order inside a playlist.
 */
function entryName(position, circle, title, originalName) {
  const number = String(position).padStart(2, '0');
  return sanitize(`${number} - ${circle} - ${title}`) + extensionOf(originalName);
}

export function trackDownloadName(album, track) {
  return entryName(track.trackNumber, album.circle, track.title, track.audio.originalName);
}

export function albumArchiveName(album) {
  return `${sanitize(`${album.circle} - ${album.title}`)}.zip`;
}

export function playlistArchiveName(playlist) {
  return `${sanitize(playlist.name)}.zip`;
}

/**
 * Stream a set of stored files to the client as a zip.
 *
 * The archive is built on the fly and piped straight to the response: nothing
 * is staged on disk, so a large download costs no temp space and the browser
 * starts receiving bytes immediately. That does mean the size is unknown up
 * front, so the response is chunked and shows no progress bar.
 *
 * Entries are *stored*, not deflated. Encoded audio is already compressed —
 * deflating it burns CPU for a fraction of a percent.
 *
 * `files` is a list of { folder, stored, name }: which storage folder the file
 * is in, the record describing it, and what it should be called inside the
 * archive. Entries are opened as streams rather than by path, because a file
 * kept in a blob store has no path to open.
 */
function streamZip(res, { fileName, files, emptyMessage }) {
  if (files.length === 0) {
    throw Object.assign(new Error(emptyMessage), { status: 404 });
  }

  const archive = new ZipArchive({ store: true });

  // A missing file is skipped rather than failing the whole download: the rest
  // is still worth having.
  archive.on('warning', (err) => {
    if (err.code === 'ENOENT') console.error('Skipped missing file in archive:', err.message);
    else throw err;
  });

  // Headers cannot be changed once piping starts, so an error mid-stream can
  // only be logged and the connection torn down.
  archive.on('error', (err) => {
    console.error('Archive failed:', err.message);
    res.destroy(err);
  });

  // If the listener navigates away, stop reading files for a response nobody
  // will receive.
  res.on('close', () => archive.destroy());

  res.attachment(fileName);
  res.type('application/zip');
  archive.pipe(res);

  for (const file of files) {
    archive.append(openUpload(file.folder, file.stored), { name: file.name });
  }

  return archive.finalize();
}

/** Every track of an album, with its artwork alongside. */
export function streamAlbumArchive(album, res) {
  // Tracks are stored in insertion order, which need not be playing order. The
  // zip carries no ordering of its own — the leading number in each name is
  // what makes the files sort correctly once unpacked — but numbering them in
  // album order keeps the archive readable if the numbers ever collide.
  const ordered = [...album.tracks].sort((a, b) => a.trackNumber - b.trackNumber);

  const files = ordered.map((track) => ({
    folder: TRACKS,
    stored: track.audio,
    name: trackDownloadName(album, track),
  }));

  // The artwork rides along so the folder is complete once unzipped.
  if (album.cover && files.length > 0) {
    files.push({
      folder: COVERS,
      stored: album.cover,
      name: `cover${extensionOf(album.cover.originalName)}`,
    });
  }

  return streamZip(res, {
    fileName: albumArchiveName(album),
    files,
    emptyMessage: 'This album has no tracks to download',
  });
}

/**
 * Every track of a playlist, numbered by its place in the running order.
 *
 * `entries` are the resolved { album, track } pairs — the controller works
 * those out, since a playlist stores references that may have gone stale.
 *
 * No artwork here: the tracks come from any number of albums, so there is no
 * one cover that belongs to the folder.
 */
export function streamPlaylistArchive(playlist, entries, res) {
  const files = entries.map(({ album, track }, position) => ({
    folder: TRACKS,
    stored: track.audio,
    name: entryName(position + 1, album.circle, track.title, track.audio.originalName),
  }));

  return streamZip(res, {
    fileName: playlistArchiveName(playlist),
    files,
    emptyMessage: 'This playlist has no tracks to download',
  });
}
