/**
 * The API as a Vercel function.
 *
 * Everything under /api is rewritten here by vercel.json, so this one function
 * is the whole Express app — the routes inside it do the dispatching, exactly
 * as they do when `npm run dev --prefix server` runs it as a normal server.
 *
 * The difference is what surrounds a request. There is no boot step to hang the
 * database connection off, because the process may be created for this request
 * and frozen straight afterwards, so connecting happens per request and the
 * connection is cached between them. Uploads go to Vercel Blob rather than to
 * disk, which the storage layer picks up from BLOB_READ_WRITE_TOKEN on its own.
 */
import app from '../server/src/app.js';
import { connectDB } from '../server/src/config/db.js';

export default async function handler(req, res) {
  // A store connected with OIDC is reached with a short-lived token Vercel
  // attaches to each request. The blob library looks for it in Vercel's request
  // context first; copying it here as well means it is found even where that
  // context is not set up, as it may not be for a plain Express function.
  const oidcToken = req.headers['x-vercel-oidc-token'];
  if (oidcToken) process.env.VERCEL_OIDC_TOKEN = oidcToken;

  try {
    await connectDB();
  } catch (err) {
    console.error('Database unavailable:', err.message);
    return res.status(503).json({ message: 'Database unavailable' });
  }

  return app(req, res);
}
