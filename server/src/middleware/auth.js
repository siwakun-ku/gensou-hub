import User from '../models/User.js';
import { verifyToken } from '../utils/token.js';

function unauthorized(message = 'Authentication required') {
  return Object.assign(new Error(message), { status: 401 });
}

/** Populates req.user from the Bearer token, or rejects with 401. */
export async function protect(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) throw unauthorized();

    const payload = verifyToken(header.slice(7));
    const user = await User.findById(payload.sub);
    // The account may have been deleted since the token was issued.
    if (!user) throw unauthorized('Account no longer exists');

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError') return next(unauthorized('Invalid token'));
    if (err.name === 'TokenExpiredError') return next(unauthorized('Session expired'));
    next(err);
  }
}

/**
 * Accepts either a normal Bearer token or a short-lived ?token= download
 * credential, for the endpoints a browser reaches by navigating rather than by
 * fetching.
 *
 * `scopeOf(req)` names the one resource the credential is good for, so a token
 * minted for one playlist cannot be replayed against another.
 */
export function allowDownloadToken(scopeOf) {
  return async (req, res, next) => {
    if ((req.headers.authorization || '').startsWith('Bearer ')) return protect(req, res, next);

    try {
      const { token } = req.query;
      if (!token) throw unauthorized();

      const payload = verifyToken(token);
      if (payload.purpose !== 'download' || payload.scope !== scopeOf(req)) {
        throw unauthorized('This download link is not valid');
      }

      const user = await User.findById(payload.sub);
      if (!user) throw unauthorized('Account no longer exists');

      req.user = user;
      next();
    } catch (err) {
      if (err.name === 'JsonWebTokenError') return next(unauthorized('Invalid download link'));
      if (err.name === 'TokenExpiredError') return next(unauthorized('This download link expired'));
      next(err);
    }
  };
}

/** Route guard for the roles allowed past it. Must run after protect. */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(
        Object.assign(new Error('This action requires an admin account'), { status: 403 })
      );
    }
    next();
  };
}

export const requireAdmin = requireRole('admin');

/**
 * Populates req.user when a valid token is present and otherwise carries on
 * anonymously. For endpoints that show more to an admin but stay public.
 */
export async function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return next();

  try {
    const payload = verifyToken(header.slice(7));
    req.user = (await User.findById(payload.sub)) ?? undefined;
  } catch {
    // A bad token is simply treated as no token here.
  }

  next();
}
