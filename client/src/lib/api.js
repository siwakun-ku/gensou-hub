import axios from 'axios';

const API_ROOT = import.meta.env.VITE_API_URL ?? '';

// In dev this stays empty and Vite proxies /api to the Express server.
const api = axios.create({
  baseURL: `${API_ROOT}/api`,
});

export const TOKEN_KEY = 'gensou-hub-token';

// Held in a module variable so every request picks it up without prop drilling,
// and mirrored to localStorage so a refresh keeps the session.
let authToken = localStorage.getItem(TOKEN_KEY);

export function setAuthToken(token) {
  authToken = token;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export const getAuthToken = () => authToken;

// Called when a token stops being accepted, so the app can drop the session.
let onUnauthorized = null;
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

api.interceptors.request.use((config) => {
  if (authToken) config.headers.Authorization = `Bearer ${authToken}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const data = error.response?.data;
    // An expired or revoked token should not leave the UI looking signed in.
    if (error.response?.status === 401 && authToken) onUnauthorized?.();
    const details = data?.errors ? Object.values(data.errors).join(', ') : null;
    const message = details || data?.message || error.message || 'Request failed';
    return Promise.reject(new Error(message));
  }
);

/** Turn a server-relative media path into one the browser can request. */
export const mediaUrl = (pathname) => (pathname ? `${API_ROOT}${pathname}` : null);

/*
 * Direct uploads.
 *
 * Deployed on Vercel, the API cannot receive a file over 4.5 MB — the platform
 * refuses the request before the server sees it — and most audio is larger. So
 * there the browser uploads each file straight to the blob store and the form
 * carries only where it went. The server says whether this applies; on a local
 * server it does not, and files travel inside the form as they always have.
 */

// Which storage folder each upload field belongs to. The server holds the
// actual rules for each folder; this only says which set to ask for.
const UPLOAD_FOLDERS = { cover: 'covers', audio: 'tracks', image: 'wallpapers', logo: 'circles' };

let directUploads = null;

/** Asked once and remembered, since it cannot change while the page is open. */
function directUploadsEnabled() {
  directUploads ??= api
    .get('/uploads/config')
    .then((r) => Boolean(r.data.direct))
    .catch(() => {
      directUploads = null; // ask again next time rather than remember a failure
      return false;
    });
  return directUploads;
}

async function uploadDirect(key, file, onProgress) {
  // Loaded on demand: only an admin uploading anything ever needs it.
  const { upload } = await import('@vercel/blob/client');

  // The name the listener gave the file travels separately, in the form; the
  // key in the store needs only to be unique and to keep the extension.
  const dot = file.name.lastIndexOf('.');
  const ext = dot === -1 ? '' : file.name.slice(dot).toLowerCase().replace(/[^a-z0-9.]/g, '').slice(0, 10);

  try {
    const blob = await upload(`${UPLOAD_FOLDERS[key]}/${Date.now()}${ext}`, file, {
      access: 'public',
      handleUploadUrl: `${API_ROOT}/api/uploads`,
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      contentType: file.type || undefined,
      onUploadProgress: ({ percentage }) => onProgress?.(Math.round(percentage)),
    });
    return blob.url;
  } catch (err) {
    throw new Error(String(err.message || 'Upload failed').replace(/^Vercel Blob:\s*/, ''));
  }
}

/**
 * Build the multipart body for a form that may carry files.
 *
 * Async because, where direct uploads apply, each file is uploaded before the
 * form is sent — and `onProgress` then follows that upload, which is the part
 * that takes any time.
 */
async function toFormData(fields, files = {}, onProgress) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    // Empty strings are kept: they are how a caption or a credit gets cleared.
    if (value !== undefined && value !== null) form.append(key, value);
  }

  const present = Object.entries(files).filter(([, file]) => file);
  const direct = present.length > 0 && (await directUploadsEnabled());

  for (const [key, file] of present) {
    if (direct) {
      form.append(`${key}Url`, await uploadDirect(key, file, onProgress));
      form.append(`${key}Name`, file.name);
    } else {
      form.append(key, file);
    }
  }
  return form;
}

export const authApi = {
  register: (payload) => api.post('/auth/register', payload).then((r) => r.data),
  login: (payload) => api.post('/auth/login', payload).then((r) => r.data),
  me: () => api.get('/auth/me').then((r) => r.data),
};

export const albumsApi = {
  list: (params = {}) => api.get('/albums', { params }).then((r) => r.data),
  get: (id) => api.get(`/albums/${id}`).then((r) => r.data),
  create: async (fields, cover) =>
    api.post('/albums', await toFormData(fields, { cover })).then((r) => r.data),
  update: async (id, fields, cover) =>
    api.put(`/albums/${id}`, await toFormData(fields, { cover })).then((r) => r.data),
  remove: (id) => api.delete(`/albums/${id}`),

  addTrack: async (albumId, fields, audio, onProgress) =>
    api
      .post(`/albums/${albumId}/tracks`, await toFormData(fields, { audio }, onProgress), {
        onUploadProgress: (event) =>
          onProgress?.(event.total ? Math.round((event.loaded / event.total) * 100) : 0),
      })
      .then((r) => r.data),
  updateTrack: (albumId, trackId, fields) =>
    api.put(`/albums/${albumId}/tracks/${trackId}`, fields).then((r) => r.data),
  removeTrack: (albumId, trackId) => api.delete(`/albums/${albumId}/tracks/${trackId}`),
};

export const favouritesApi = {
  list: () => api.get('/favourites').then((r) => r.data),
  // Just the ids, for deciding which stars are lit without fetching the tracks.
  ids: () => api.get('/favourites/ids').then((r) => r.data.data),
  add: (albumId, trackId) => api.post('/favourites', { albumId, trackId }).then((r) => r.data),
  remove: (albumId, trackId) => api.delete(`/favourites/${albumId}/${trackId}`),

  /**
   * Star several at once. `payload` is either `{ albumId }` for a whole record
   * or `{ items: [{ albumId, trackId }] }` for a chosen few — the album form
   * stays right even if the record gained a track since the page loaded.
   */
  addMany: (payload) => api.post('/favourites/bulk', payload).then((r) => r.data),

  // Same two payload shapes. A DELETE carries its body under `data` in axios.
  removeMany: (payload) =>
    api.delete('/favourites/bulk', { data: payload }).then((r) => r.data),
};

export const circlesApi = {
  // The directory: every circle the library knows, written up or not.
  list: (params = {}) => api.get('/circles', { params }).then((r) => r.data),

  /**
   * One circle, by name.
   *
   * A circle is addressed by name rather than by id because the name is the
   * only thing an album carries, and a circle nobody has written up has no id
   * to be addressed by. It goes in the query string so a name containing a
   * slash still arrives in one piece.
   */
  get: (name) => api.get('/circles/lookup', { params: { name } }).then((r) => r.data),

  // `links` is a list, and multipart has no way to say that — it travels as
  // JSON in a single field and is parsed back on the server.
  create: async (fields, logo) =>
    api.post('/circles', await toFormData(withLinks(fields), { logo })).then((r) => r.data),
  update: async (id, fields, logo) =>
    api.put(`/circles/${id}`, await toFormData(withLinks(fields), { logo })).then((r) => r.data),
  remove: (id) => api.delete(`/circles/${id}`),
};

function withLinks(fields) {
  if (!Array.isArray(fields.links)) return fields;
  return { ...fields, links: JSON.stringify(fields.links) };
}

export const tracksApi = {
  /**
   * Search the library one track at a time. The album search answers a
   * different question and lives on albumsApi.list.
   */
  search: (params = {}) => api.get('/tracks', { params }).then((r) => r.data),
};

export default api;

export const wallpapersApi = {
  // The hero calls this without a token; an admin passes all=true to include
  // retired slides.
  list: (all = false) =>
    api.get('/wallpapers', { params: all ? { all: true } : {} }).then((r) => r.data),
  create: async (fields, image, onProgress) =>
    api
      .post('/wallpapers', await toFormData(fields, { image }, onProgress), {
        onUploadProgress: (event) =>
          onProgress?.(event.total ? Math.round((event.loaded / event.total) * 100) : 0),
      })
      .then((r) => r.data),
  update: async (id, fields, image) =>
    api.put(`/wallpapers/${id}`, await toFormData(fields, { image })).then((r) => r.data),
  reorder: (ids) => api.put('/wallpapers/reorder', { ids }).then((r) => r.data),
  remove: (id) => api.delete(`/wallpapers/${id}`),
};

export const recommendationsApi = {
  // Public: what the home page shows.
  list: () => api.get('/recommendations').then((r) => r.data),
  // Admin: the configuration behind it.
  getSettings: () => api.get('/recommendations/settings').then((r) => r.data),
  updateSettings: (payload) =>
    api.put('/recommendations/settings', payload).then((r) => r.data),
};

export const playlistsApi = {
  // Every call here needs a signed-in caller; the interceptor attaches the token.
  list: () => api.get('/playlists').then((r) => r.data.data),
  get: (id) => api.get(`/playlists/${id}`).then((r) => r.data),
  create: (payload) => api.post('/playlists', payload).then((r) => r.data),
  update: (id, payload) => api.put(`/playlists/${id}`, payload).then((r) => r.data),
  remove: (id) => api.delete(`/playlists/${id}`),

  // Adding, removing and reordering all return the updated playlist, so the
  // caller never has to re-fetch to redraw.
  addTrack: (id, albumId, trackId) =>
    api.post(`/playlists/${id}/items`, { albumId, trackId }).then((r) => r.data),

  /**
   * Add several at once. `payload` takes the same two shapes the favourites
   * bulk call does. Hands back `{ added, skipped, playlist }`, so the caller
   * can both redraw and say what actually happened.
   */
  addTracks: (id, payload) =>
    api.post(`/playlists/${id}/items/bulk`, payload).then((r) => r.data),
  removeItem: (id, itemId) => api.delete(`/playlists/${id}/items/${itemId}`).then((r) => r.data),
  reorder: (id, itemIds) => api.put(`/playlists/${id}/items`, { itemIds }).then((r) => r.data),

  /**
   * A download is a browser navigation, which cannot carry the Authorization
   * header this API runs on — so trade the session for a short-lived, single
   * playlist credential and hand back a URL that stands on its own.
   */
  downloadUrl: async (id) => {
    const { token } = await api.post(`/playlists/${id}/download-token`).then((r) => r.data);
    return `${API_ROOT}/api/playlists/${id}/download?token=${encodeURIComponent(token)}`;
  },
};
