import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';
import { COVERS, TRACKS, WALLPAPERS, CIRCLES, dirFor, usingBlob } from '../config/storage.js';
import { AUDIO_MIME_TYPES, IMAGE_MIME_TYPES } from '../models/Album.js';

const MB = 1024 * 1024;

/**
 * What each kind of upload may be: the form field it arrives in, the types
 * accepted and how large it can get. Keyed by storage folder, because that is
 * also what a browser names when it asks for permission to upload directly.
 */
export const UPLOAD_RULES = {
  [COVERS]: {
    field: 'cover',
    allowed: IMAGE_MIME_TYPES,
    label: 'image',
    maxBytes: Number(process.env.MAX_COVER_MB || 5) * MB,
  },
  [TRACKS]: {
    field: 'audio',
    allowed: AUDIO_MIME_TYPES,
    label: 'audio',
    maxBytes: Number(process.env.MAX_AUDIO_MB || 50) * MB,
  },
  [WALLPAPERS]: {
    field: 'image',
    allowed: IMAGE_MIME_TYPES,
    label: 'image',
    // Hero images are full-bleed, so they get a larger budget than a cover.
    maxBytes: Number(process.env.MAX_WALLPAPER_MB || 10) * MB,
  },
  [CIRCLES]: {
    field: 'logo',
    allowed: IMAGE_MIME_TYPES,
    label: 'image',
    // A logo is shown small wherever it appears, so it needs less room than a
    // cover, let alone a hero image.
    maxBytes: Number(process.env.MAX_LOGO_MB || 3) * MB,
  },
};

/** Never trust the client's file name on disk. */
function generatedName(file) {
  const ext = path.extname(file.originalname).toLowerCase().slice(0, 10);
  return `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
}

/**
 * Where multer puts the bytes while the request is in flight.
 *
 * On disk that is the final resting place. For blob it is memory, because the
 * file has to be handed to the store as one piece and a Vercel function has
 * nowhere to stage it.
 *
 * Either way the file ends up with a `filename`, so the two drivers agree on
 * what an upload is called before storage decides where it goes.
 */
function storageFor(folder) {
  if (usingBlob()) return multer.memoryStorage();

  return multer.diskStorage({
    destination: (req, file, cb) => cb(null, dirFor(folder)),
    filename: (req, file, cb) => cb(null, generatedName(file)),
  });
}

function filterFor(allowed, label) {
  return (req, file, cb) => {
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(
      Object.assign(new Error(`Unsupported ${label} type: ${file.mimetype}`), { status: 400 })
    );
  };
}

const badRequest = (message) => Object.assign(new Error(message), { status: 400 });

async function headBlob(url) {
  const { head } = await import('@vercel/blob');
  return head(url);
}

async function deleteBlob(url) {
  try {
    const { del } = await import('@vercel/blob');
    await del(url);
  } catch (err) {
    console.error('Failed to remove rejected upload:', err.message);
  }
}

/**
 * A file the browser uploaded straight to the blob store, described as if
 * multer had received it.
 *
 * A Vercel function refuses any request over 4.5 MB, which rules out sending
 * most audio through the API at all. So in a deployment the browser uploads the
 * file itself and the form carries only where it went: `<field>Path`, the
 * pathname the server chose for it, plus the name it had on the listener's
 * machine in `<field>Name`.
 *
 * None of that is taken on trust. The store is asked about the pathname
 * directly, which fails for anything not in this store, and its answer — not
 * the form — decides the type and size, which are checked against the same
 * rules a normal upload meets. A file that fails is removed rather than left
 * orphaned.
 *
 * Returns null when the form names no such file. `head` and `remove` are
 * parameters so the checks can be tested without a real store.
 */
export async function fileFromBlob(
  folder,
  rule,
  body,
  { head = headBlob, remove = deleteBlob } = {}
) {
  const pathname = body?.[`${rule.field}Path`];
  if (!pathname) return null;

  let blob;
  try {
    blob = await head(String(pathname));
  } catch {
    throw badRequest('The uploaded file could not be found in storage');
  }

  const reject = async (message) => {
    await remove(blob.url);
    throw badRequest(message);
  };

  if (!blob.pathname.startsWith(`${folder}/`)) {
    return reject(`That file was not uploaded as a ${rule.field}`);
  }
  if (!rule.allowed.includes(blob.contentType)) {
    return reject(`Unsupported ${rule.label} type: ${blob.contentType}`);
  }
  if (blob.size > rule.maxBytes) return reject('File is too large');

  const storedName = path.posix.basename(blob.pathname);

  return {
    filename: storedName,
    originalname: String(body[`${rule.field}Name`] || storedName).slice(0, 255),
    mimetype: blob.contentType,
    size: blob.size,
    url: blob.url,
  };
}

function uploadFor(folder) {
  const rule = UPLOAD_RULES[folder];

  const handler = multer({
    storage: storageFor(folder),
    fileFilter: filterFor(rule.allowed, rule.label),
    limits: { fileSize: rule.maxBytes, files: 1 },
  }).single(rule.field);

  return (req, res, next) =>
    handler(req, res, async (err) => {
      if (err) return next(err);

      try {
        if (!req.file && usingBlob()) {
          const direct = await fileFromBlob(folder, rule, req.body);
          if (direct) req.file = direct;
        }
        // Not part of the record; the controllers should never see them.
        delete req.body?.[`${rule.field}Path`];
        delete req.body?.[`${rule.field}Name`];

        // Memory storage leaves no `filename`, so it is named here instead —
        // after the filter has accepted the file, and before a controller reads it.
        if (req.file && !req.file.filename) req.file.filename = generatedName(req.file);
        next();
      } catch (error) {
        next(error);
      }
    });
}

export const uploadCover = uploadFor(COVERS);
export const uploadAudio = uploadFor(TRACKS);
export const uploadWallpaper = uploadFor(WALLPAPERS);
export const uploadCircleLogo = uploadFor(CIRCLES);
