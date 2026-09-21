import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { protect, requireAdmin } from '../middleware/auth.js';
import { uploadCover, uploadAudio } from '../middleware/upload.js';
import {
  listAlbums,
  getAlbum,
  createAlbum,
  updateAlbum,
  deleteAlbum,
  getCover,
  addTrack,
  updateTrack,
  deleteTrack,
  streamTrack,
  downloadTrack,
  downloadAlbum,
} from '../controllers/albumController.js';

const router = Router();

// Browsing, streaming and downloading stay open to everyone.
// Everything that changes the library is admin-only.
const adminOnly = [protect, requireAdmin];

router
  .route('/')
  .get(asyncHandler(listAlbums))
  .post(...adminOnly, uploadCover, asyncHandler(createAlbum));

router
  .route('/:id')
  .get(asyncHandler(getAlbum))
  .put(...adminOnly, uploadCover, asyncHandler(updateAlbum))
  .delete(...adminOnly, asyncHandler(deleteAlbum));

router.get('/:id/cover', asyncHandler(getCover));

// The whole album as a single zip.
router.get('/:id/download', asyncHandler(downloadAlbum));

router.post('/:id/tracks', ...adminOnly, uploadAudio, asyncHandler(addTrack));

router
  .route('/:id/tracks/:trackId')
  .put(...adminOnly, asyncHandler(updateTrack))
  .delete(...adminOnly, asyncHandler(deleteTrack));

router.get('/:id/tracks/:trackId/stream', asyncHandler(streamTrack));
router.get('/:id/tracks/:trackId/download', asyncHandler(downloadTrack));

export default router;
