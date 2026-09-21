import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { protect, requireAdmin } from '../middleware/auth.js';
import { uploadCircleLogo } from '../middleware/upload.js';
import {
  listCircles,
  lookupCircle,
  createCircle,
  updateCircle,
  deleteCircle,
  getCircleLogo,
} from '../controllers/circleController.js';

const router = Router();

// Reading the directory is part of browsing the library; writing a profile is
// editing it, and stays with the albums behind the admin check.
const adminOnly = [protect, requireAdmin];

router
  .route('/')
  .get(asyncHandler(listCircles))
  .post(...adminOnly, uploadCircleLogo, asyncHandler(createCircle));

// Declared before "/:id" so "lookup" is not read as an id.
router.get('/lookup', asyncHandler(lookupCircle));

router
  .route('/:id')
  .put(...adminOnly, uploadCircleLogo, asyncHandler(updateCircle))
  .delete(...adminOnly, asyncHandler(deleteCircle));

router.get('/:id/logo', asyncHandler(getCircleLogo));

export default router;
