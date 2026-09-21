import jwt from 'jsonwebtoken';

function secret() {
  const value = process.env.JWT_SECRET;
  if (!value) throw new Error('JWT_SECRET is not set. Copy .env.example to .env');
  return value;
}

export function signToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, secret(), {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

/**
 * A credential for one download, good for a minute.
 *
 * A file download is a plain browser navigation, which cannot carry an
 * Authorization header — so the caller trades its session token for one of
 * these and puts it in the URL. It is scoped to a single resource and expires
 * almost immediately, which is what makes it safe to put somewhere as leaky as
 * a URL: by the time it could turn up in a log or a history entry, it is dead.
 */
export function signDownloadToken(user, scope) {
  return jwt.sign({ sub: user._id.toString(), purpose: 'download', scope }, secret(), {
    expiresIn: '60s',
  });
}

export function verifyToken(token) {
  return jwt.verify(token, secret());
}
