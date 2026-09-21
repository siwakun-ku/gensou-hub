import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { protect, requireAdmin, optionalAuth } from '../middleware/auth.js';
import { uploadWallpaper } from '../middleware/upload.js';
import {
  listWallpapers,
  getWallpaper,
  createWallpaper,
  updateWallpaper,
  reorderWallpapers,
  deleteWallpaper,
  getWallpaperImage,
} from '../controllers/wallpaperController.js';

const router = Router();

const adminOnly = [protect, requireAdmin];

router
  .route('/')
  // optionalAuth so an admin listing with ?all=true also sees retired slides.
  .get(optionalAuth, asyncHandler(listWallpapers))
  .post(...adminOnly, uploadWallpaper, asyncHandler(createWallpaper));

// Declared before "/:id" so "reorder" is not read as an id.
router.put('/reorder', ...adminOnly, asyncHandler(reorderWallpapers));

router
  .route('/:id')
  .get(asyncHandler(getWallpaper))
  .put(...adminOnly, uploadWallpaper, asyncHandler(updateWallpaper))
  .delete(...adminOnly, asyncHandler(deleteWallpaper));

router.get('/:id/image', asyncHandler(getWallpaperImage));

export default router;
