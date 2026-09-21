import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { searchTracks } from '../controllers/trackController.js';

const router = Router();

// Browsing and searching the library stay open to everyone, as they are for
// albums. Tracks are only ever created and edited through their album.
router.get('/', asyncHandler(searchTracks));

export default router;
