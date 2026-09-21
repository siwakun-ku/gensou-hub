import { usingBlob, assertBlobConfigured } from '../config/storage.js';
import { UPLOAD_RULES } from '../middleware/upload.js';

/**
 * Direct uploads: the browser sends a file straight to the blob store instead
 * of through the API.
 *
 * It has to in a deployment. A Vercel function refuses any request over
 * 4.5 MB, and most audio is larger than that — so the file goes to the store
 * and the form that follows carries only its address. The upload middleware
 * checks that address before any controller sees it.
 *
 * On the disk driver none of this applies and the browser keeps sending files
 * the ordinary way, which is what `config` tells it.
 */

// GET /api/uploads/config
export function getUploadConfig(req, res) {
  res.json({ direct: usingBlob() });
}

// POST /api/uploads  (admin; called by @vercel/blob/client's upload())
//
// Hands out a client token: permission to put one file into the store, which
// the store itself enforces. The folder the browser asks for decides what it
// may upload, by the same rules a normal upload into that folder meets.
export async function issueUploadToken(req, res) {
  if (!usingBlob()) {
    throw Object.assign(new Error('Direct uploads are not enabled on this server'), {
      status: 404,
    });
  }

  assertBlobConfigured();
  const { handleUpload } = await import('@vercel/blob/client');

  const result = await handleUpload({
    body: req.body,
    request: req,
    onBeforeGenerateToken: async (pathname) => {
      const folder = pathname.split('/')[0];
      const rule = Object.hasOwn(UPLOAD_RULES, folder) ? UPLOAD_RULES[folder] : null;

      if (!rule) {
        throw Object.assign(new Error(`Uploads are not accepted into "${folder}"`), {
          status: 400,
        });
      }

      return {
        allowedContentTypes: rule.allowed,
        maximumSizeInBytes: rule.maxBytes,
        // The browser names the file; the suffix keeps two uploads of
        // "cover.jpg" from landing on the same key.
        addRandomSuffix: true,
      };
    },
  });

  res.json(result);
}
