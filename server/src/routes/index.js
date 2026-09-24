import { Router } from 'express';
import authRoutes from './authRoutes.js';
import albumRoutes from './albumRoutes.js';
import trackRoutes from './trackRoutes.js';
import circleRoutes from './circleRoutes.js';
import wallpaperRoutes from './wallpaperRoutes.js';
import recommendationRoutes from './recommendationRoutes.js';
import playlistRoutes from './playlistRoutes.js';
import favouriteRoutes from './favouriteRoutes.js';
import uploadRoutes from './uploadRoutes.js';

const router = Router();

// Storage lists the *names* of the blob-related variables this function can see
// (never their values), so a store that is connected but not reaching the
// deployment — wrong environment, custom prefix, other project — shows up here.
router.get('/health', (req, res) =>
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    storage: {
      configured: Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN),
      environment: process.env.VERCEL_ENV || null,
      variables: Object.keys(process.env)
        .filter((name) => /BLOB|STORE_ID|OIDC/i.test(name))
        .sort(),
    },
  })
);
router.use('/auth', authRoutes);
router.use('/albums', albumRoutes);
router.use('/tracks', trackRoutes);
router.use('/circles', circleRoutes);
router.use('/wallpapers', wallpaperRoutes);
router.use('/recommendations', recommendationRoutes);
router.use('/playlists', playlistRoutes);
router.use('/favourites', favouriteRoutes);
router.use('/uploads', uploadRoutes);

export default router;
