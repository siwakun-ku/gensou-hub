import path from 'node:path';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

/**
 * Where uploads live.
 *
 * Two drivers behind one interface. On a machine with a filesystem the files sit
 * in ./uploads, which is what the tests and local development use. On Vercel
 * every request runs in a function with a read-only disk, so the files go to
 * Vercel Blob instead and are served from its CDN.
 *
 * The rest of the server talks in *file records* — the { fileName, url } shape
 * stored on each document — rather than in paths, because a blob has no path.
 * `url` is set by the blob driver and absent on disk.
 */

const here = path.dirname(fileURLToPath(import.meta.url));

// The folder an upload belongs to: a directory on disk, a key prefix on blob.
export const COVERS = 'covers';
export const TRACKS = 'tracks';
export const WALLPAPERS = 'wallpapers';
export const CIRCLES = 'circles';

const FOLDERS = [COVERS, TRACKS, WALLPAPERS, CIRCLES];

// UPLOAD_DIR lets the test suite redirect writes to a temp directory.
export const UPLOAD_ROOT = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.resolve(here, '../../uploads');

/**
 * Blob when a store is linked, disk otherwise — so a Vercel deployment picks it
 * up on its own and nothing local has to change. STORAGE_DRIVER overrides it,
 * which is how you exercise blob from your own machine.
 *
 * On Vercel it is always blob, token or not. Its disk is read-only, so falling
 * back to disk there can only fail — and fail with an EROFS error that says
 * nothing about the actual problem, which is a store that is not connected.
 * Choosing blob lets `put` below say that instead.
 */
export function usingBlob() {
  if (process.env.STORAGE_DRIVER === 'blob') return true;
  if (process.env.STORAGE_DRIVER === 'disk') return false;
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL);
}

/**
 * Throw a message someone can act on when the store is not connected, instead
 * of whatever the blob library would say about a missing token.
 */
export function assertBlobConfigured() {
  if (process.env.BLOB_READ_WRITE_TOKEN) return;

  throw Object.assign(
    new Error(
      'File storage is not configured: BLOB_READ_WRITE_TOKEN is not set. Connect a ' +
        'Blob store to this Vercel project (Storage tab), then redeploy.'
    ),
    { status: 500 }
  );
}

/** The directory a folder's files sit in, on the disk driver. */
export function dirFor(folder) {
  return path.join(UPLOAD_ROOT, folder);
}

/**
 * Resolve a stored file name to an absolute path, refusing anything that
 * escapes the upload directory (a stored name should never contain a
 * separator, but the DB is not a trust boundary worth skipping this for).
 */
export function resolveUpload(folder, fileName) {
  const dir = dirFor(folder);
  const full = path.resolve(dir, fileName);
  if (full !== path.join(dir, path.basename(full))) {
    throw Object.assign(new Error('Invalid file path'), { status: 400 });
  }
  return full;
}

/** Nothing to create up front when the files live in a blob store. */
export async function ensureUploadDirs() {
  if (usingBlob()) return;
  await Promise.all(FOLDERS.map((folder) => fs.mkdir(dirFor(folder), { recursive: true })));
}

/**
 * Commit an uploaded file to storage and describe it for the document.
 *
 * Multer has already written it to disk, or held it in memory for blob — so
 * this is a no-op on one driver and a network call on the other, and every
 * caller has to await it either way.
 */
export async function storeUpload(folder, file) {
  return {
    ...(await put(folder, file)),
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
  };
}

async function put(folder, file) {
  // The browser uploaded it to the store itself, and the upload middleware has
  // already checked it there. There is nothing left to write.
  if (file.url) return { fileName: file.filename, url: file.url };

  if (!usingBlob()) return { fileName: file.filename };

  assertBlobConfigured();
  const { put: putBlob } = await import('@vercel/blob');
  // The generated name is already unique, so the store need not add a suffix of
  // its own — which keeps the key readable and predictable.
  const blob = await putBlob(`${folder}/${file.filename}`, file.buffer, {
    access: 'public',
    contentType: file.mimetype,
    addRandomSuffix: false,
  });

  return { fileName: file.filename, url: blob.url };
}

/** Best-effort delete: a missing file must not fail the request. */
export async function removeUpload(folder, stored) {
  if (!stored?.fileName) return;

  try {
    if (stored.url) {
      const { del } = await import('@vercel/blob');
      await del(stored.url);
      return;
    }
    await fs.unlink(resolveUpload(folder, stored.fileName));
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('Failed to remove upload:', err.message);
  }
}

/**
 * A readable stream of a stored file, for the zip builder.
 *
 * Nothing is opened or fetched until the archive actually reaches this entry,
 * so zipping a long album holds one file at a time rather than an open handle
 * — or an in-flight request — for every track at once.
 *
 * A file that has gone missing yields nothing instead of throwing: one absent
 * track should cost that track, not the whole download.
 */
export function openUpload(folder, stored) {
  return Readable.from(
    (async function* () {
      try {
        if (stored.url) {
          const response = await fetch(stored.url);
          if (!response.ok) throw new Error(`blob responded ${response.status}`);
          yield* response.body;
          return;
        }
        yield* createReadStream(resolveUpload(folder, stored.fileName));
      } catch (err) {
        console.error('Skipped missing file in archive:', stored.fileName, err.message);
      }
    })()
  );
}

/**
 * Send a stored file to the browser.
 *
 * On disk Express does the work, honouring Range requests so a listener can
 * seek within a track. On blob the CDN is better placed to serve the bytes than
 * a function is, so the response is a redirect — except for a download, where
 * the file has to arrive under a name of our choosing and the only way to say
 * so is to set the header ourselves, which means piping it through.
 */
export async function sendUpload(res, folder, stored, downloadName) {
  if (!stored.url) {
    if (downloadName) return res.download(resolveUpload(folder, stored.fileName), downloadName);

    res.setHeader('Accept-Ranges', 'bytes');
    return res.sendFile(resolveUpload(folder, stored.fileName));
  }

  if (!downloadName) return res.redirect(302, stored.url);

  const response = await fetch(stored.url);
  if (!response.ok) throw Object.assign(new Error('File is no longer stored'), { status: 404 });

  res.attachment(downloadName);
  res.type(stored.mimeType || 'application/octet-stream');
  return Readable.fromWeb(response.body).pipe(res);
}
