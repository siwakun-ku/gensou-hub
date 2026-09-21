import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';
import { COVERS, TRACKS, WALLPAPERS, CIRCLES, dirFor, usingBlob } from '../config/storage.js';
import { AUDIO_MIME_TYPES, IMAGE_MIME_TYPES } from '../models/Album.js';

const MB = 1024 * 1024;

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
 * nowhere to stage it — which is why the size limits below double as the
 * function's memory budget.
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

function uploadFor(folder, { field, allowed, label, maxMb }) {
  const handler = multer({
    storage: storageFor(folder),
    fileFilter: filterFor(allowed, label),
    limits: { fileSize: maxMb * MB, files: 1 },
  }).single(field);

  // Memory storage leaves no `filename`, so it is named here instead — after
  // the filter has accepted the file, and before any controller reads it.
  return (req, res, next) =>
    handler(req, res, (err) => {
      if (!err && req.file && !req.file.filename) req.file.filename = generatedName(req.file);
      next(err);
    });
}

export const uploadCover = uploadFor(COVERS, {
  field: 'cover',
  allowed: IMAGE_MIME_TYPES,
  label: 'image',
  maxMb: Number(process.env.MAX_COVER_MB || 5),
});

export const uploadAudio = uploadFor(TRACKS, {
  field: 'audio',
  allowed: AUDIO_MIME_TYPES,
  label: 'audio',
  maxMb: Number(process.env.MAX_AUDIO_MB || 50),
});

export const uploadWallpaper = uploadFor(WALLPAPERS, {
  field: 'image',
  allowed: IMAGE_MIME_TYPES,
  label: 'image',
  // Hero images are full-bleed, so they get a larger budget than a cover.
  maxMb: Number(process.env.MAX_WALLPAPER_MB || 10),
});

export const uploadCircleLogo = uploadFor(CIRCLES, {
  field: 'logo',
  allowed: IMAGE_MIME_TYPES,
  label: 'image',
  // A logo is shown small wherever it appears, so it needs less room than a
  // cover, let alone a hero image.
  maxMb: Number(process.env.MAX_LOGO_MB || 3),
});
