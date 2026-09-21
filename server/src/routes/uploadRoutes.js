import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { protect, requireAdmin } from '../middleware/auth.js';
import { getUploadConfig, issueUploadToken } from '../controllers/uploadController.js';

const router = Router();

router.get('/config', getUploadConfig);
router.post('/', protect, requireAdmin, asyncHandler(issueUploadToken));

export default router;
