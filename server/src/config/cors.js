/**
 * CORS policy.
 *
 * In development the Vite dev server proxies /api, so the browser never makes a
 * cross-origin request and this barely matters. It matters when a device on the
 * LAN talks to the API directly — a built client served from another host, or a
 * phone hitting http://192.168.1.20:5000/api.
 */

// RFC 1918 private ranges plus loopback, i.e. addresses that only exist inside
// a local network. 172.16-172.31 only — 172.32+ is public.
const PRIVATE_IPV4 =
  /^(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|127\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|169\.254\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/;

const LOCAL_HOSTNAMES = new Set(['localhost', '::1', '[::1]', '0.0.0.0']);

/** True for a hostname that can only be reached from this machine or this LAN. */
export function isLocalHostname(hostname) {
  if (!hostname) return false;

  const host = hostname.toLowerCase();
  if (LOCAL_HOSTNAMES.has(host)) return true;

  // mDNS names published by phones, Macs and Raspberry Pis on the LAN.
  if (host.endsWith('.local')) return true;

  return PRIVATE_IPV4.test(host);
}

/** The explicit allow-list from CLIENT_ORIGIN (comma separated). */
export function configuredOrigins(env = process.env) {
  return (env.CLIENT_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

/**
 * Decide whether a browser Origin may call the API.
 *
 * A request with no Origin header (curl, a mobile app, a same-origin fetch) is
 * allowed — CORS is a browser mechanism and blocking those buys nothing.
 */
export function isAllowedOrigin(origin, env = process.env) {
  if (!origin) return true;

  const allowList = configuredOrigins(env);
  if (allowList.includes('*')) return true;
  if (allowList.includes(origin.replace(/\/$/, ''))) return true;

  // Opt-out for a deployment that should only answer the configured origins.
  if (env.ALLOW_LAN_ORIGINS === 'false') return false;

  try {
    return isLocalHostname(new URL(origin).hostname);
  } catch {
    return false; // not a parseable origin
  }
}

export function corsOptions(env = process.env) {
  return {
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin, env)) return callback(null, true);
      callback(Object.assign(new Error(`Origin not allowed by CORS: ${origin}`), { status: 403 }));
    },
  };
}
