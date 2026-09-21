import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { protect, requireAdmin } from '../middleware/auth.js';
import {
  listRecommendations,
  getSettings,
  updateSettings,
} from '../controllers/recommendationController.js';

const router = Router();

const adminOnly = [protect, requireAdmin];

// Declared before "/" so "settings" is never read as something else.
router
  .route('/settings')
  .get(...adminOnly, asyncHandler(getSettings))
  .put(...adminOnly, asyncHandler(updateSettings));

// The home page section — public, like the rest of the library.
router.get('/', asyncHandler(listRecommendations));

export default router;
