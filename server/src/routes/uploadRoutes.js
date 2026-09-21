import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { protect, requireAdmin } from '../middleware/auth.js';
import { getUploadConfig, presignUpload } from '../controllers/uploadController.js';

const router = Router();

router.get('/config', getUploadConfig);
router.post('/', protect, requireAdmin, asyncHandler(presignUpload));

export default router;
