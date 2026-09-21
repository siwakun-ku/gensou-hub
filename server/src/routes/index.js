import { Router } from 'express';
import authRoutes from './authRoutes.js';
import albumRoutes from './albumRoutes.js';
import trackRoutes from './trackRoutes.js';
import circleRoutes from './circleRoutes.js';
import wallpaperRoutes from './wallpaperRoutes.js';
import recommendationRoutes from './recommendationRoutes.js';
import playlistRoutes from './playlistRoutes.js';
import favouriteRoutes from './favouriteRoutes.js';

const router = Router();

router.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));
router.use('/auth', authRoutes);
router.use('/albums', albumRoutes);
router.use('/tracks', trackRoutes);
router.use('/circles', circleRoutes);
router.use('/wallpapers', wallpaperRoutes);
router.use('/recommendations', recommendationRoutes);
router.use('/playlists', playlistRoutes);
router.use('/favourites', favouriteRoutes);

export default router;
