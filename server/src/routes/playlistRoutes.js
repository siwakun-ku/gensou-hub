import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { protect, allowDownloadToken } from '../middleware/auth.js';
import {
  listPlaylists,
  getPlaylist,
  createPlaylist,
  updatePlaylist,
  deletePlaylist,
  addItem,
  addItems,
  removeItem,
  reorderItems,
  createDownloadToken,
  downloadPlaylist,
} from '../controllers/playlistController.js';

const router = Router();

// Ahead of the blanket protect below, because this one is reached by a browser
// navigation that cannot set an Authorization header. It takes a scoped,
// one-minute ?token= instead, and the controller still checks ownership.
router.get(
  '/:id/download',
  allowDownloadToken((req) => `playlist:${req.params.id}`),
  asyncHandler(downloadPlaylist)
);

// A playlist is private to the account that made it, so every route here needs
// a signed-in caller; the controller checks ownership on top of that.
router.use(protect);

router.route('/').get(asyncHandler(listPlaylists)).post(asyncHandler(createPlaylist));

router
  .route('/:id')
  .get(asyncHandler(getPlaylist))
  .put(asyncHandler(updatePlaylist))
  .delete(asyncHandler(deletePlaylist));

router.route('/:id/items').post(asyncHandler(addItem)).put(asyncHandler(reorderItems));

// Several tracks, or a whole album, in one request.
router.post('/:id/items/bulk', asyncHandler(addItems));

router.delete('/:id/items/:itemId', asyncHandler(removeItem));

router.post('/:id/download-token', asyncHandler(createDownloadToken));

export default router;
