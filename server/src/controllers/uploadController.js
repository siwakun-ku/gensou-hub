import path from 'node:path';
import crypto from 'node:crypto';
import { usingBlob, assertBlobConfigured } from '../config/storage.js';
import { UPLOAD_RULES } from '../middleware/upload.js';

/**
 * Direct uploads: the browser sends a file straight to the blob store instead
 * of through the API.
 *
 * It has to in a deployment. A Vercel function refuses any request over
 * 4.5 MB, and most audio is larger than that — so the file goes to the store
 * and the form that follows carries only where it went. The upload middleware
 * checks that before any controller sees it.
 *
 * On the disk driver none of this applies and the browser keeps sending files
 * the ordinary way, which is what `config` tells it.
 */

// How long a signed upload URL stays usable. Long enough for a large file on a
// slow connection; short enough that a leaked one is not worth much.
const UPLOAD_WINDOW_MS = 15 * 60 * 1000;

// GET /api/uploads/config
export function getUploadConfig(req, res) {
  res.json({ direct: usingBlob() });
}

const badRequest = (message) => Object.assign(new Error(message), { status: 400 });

/**
 * POST /api/uploads  (admin)  { folder, name, type }
 *
 * Hands back a signed URL the browser can PUT one file to, and the pathname it
 * will land at.
 *
 * Signed URLs rather than the older client tokens, because a client token can
 * only be minted from a long-lived BLOB_READ_WRITE_TOKEN, and a store connected
 * today authenticates with OIDC and has no such token. `issueSignedToken`
 * works with either.
 *
 * The server chooses the pathname, so the browser never decides where a file
 * lands; and the type and size limits for the folder are signed into the URL,
 * so the store itself turns away anything else.
 */
export async function presignUpload(req, res) {
  if (!usingBlob()) {
    throw Object.assign(new Error('Direct uploads are not enabled on this server'), {
      status: 404,
    });
  }

  const { folder, name = '', type = '' } = req.body ?? {};
  const rule = Object.hasOwn(UPLOAD_RULES, folder) ? UPLOAD_RULES[folder] : null;

  if (!rule) throw badRequest(`Uploads are not accepted into "${folder}"`);
  // Checked here too, not only by the store, so the listener hears why.
  if (!rule.allowed.includes(type)) {
    throw badRequest(`Unsupported ${rule.label} type: ${type || 'unknown'}`);
  }

  assertBlobConfigured();

  const ext = path.extname(String(name)).toLowerCase().replace(/[^a-z0-9.]/g, '').slice(0, 10);
  const pathname = `${folder}/${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;

  const { issueSignedToken, presignUrl } = await import('@vercel/blob');

  const limits = { allowedContentTypes: rule.allowed, maximumSizeInBytes: rule.maxBytes };

  const token = await issueSignedToken({
    pathname,
    operations: ['put'],
    validUntil: Date.now() + UPLOAD_WINDOW_MS,
    ...limits,
  });

  const { presignedUrl } = await presignUrl(token, {
    operation: 'put',
    pathname,
    access: 'public',
    ...limits,
    // The name is already unique, and chosen here; keep it exactly.
    addRandomSuffix: false,
    allowOverwrite: false,
  });

  res.json({ pathname, uploadUrl: presignedUrl });
}
