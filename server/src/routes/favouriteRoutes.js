import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { protect } from '../middleware/auth.js';
import {
  listFavourites,
  listFavouriteIds,
  addFavourite,
  addFavourites,
  removeFavourite,
  removeFavourites,
} from '../controllers/favouriteController.js';

const router = Router();

// A favourite belongs to the account that made it, so every route needs a
// signed-in caller and only ever touches that caller's own marks.
router.use(protect);

router.route('/').get(asyncHandler(listFavourites)).post(asyncHandler(addFavourite));

// Ahead of nothing else, but kept above the :albumId route for clarity.
router.get('/ids', asyncHandler(listFavouriteIds));

// Several tracks, or a whole album, in one request. Declared above the
// "/:albumId/:trackId" delete so "bulk" is not read as an album id.
router
  .route('/bulk')
  .post(asyncHandler(addFavourites))
  .delete(asyncHandler(removeFavourites));

router.delete('/:albumId/:trackId', asyncHandler(removeFavourite));

export default router;
