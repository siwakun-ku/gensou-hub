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

function toFormData(fields, files = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    // Empty strings are kept: they are how a caption or a credit gets cleared.
    if (value !== undefined && value !== null) form.append(key, value);
  }
  for (const [key, file] of Object.entries(files)) {
    if (file) form.append(key, file);
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
  create: (fields, cover) =>
    api.post('/albums', toFormData(fields, { cover })).then((r) => r.data),
  update: (id, fields, cover) =>
    api.put(`/albums/${id}`, toFormData(fields, { cover })).then((r) => r.data),
  remove: (id) => api.delete(`/albums/${id}`),

  addTrack: (albumId, fields, audio, onProgress) =>
    api
      .post(`/albums/${albumId}/tracks`, toFormData(fields, { audio }), {
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
  create: (fields, logo) =>
    api.post('/circles', toFormData(withLinks(fields), { logo })).then((r) => r.data),
  update: (id, fields, logo) =>
    api.put(`/circles/${id}`, toFormData(withLinks(fields), { logo })).then((r) => r.data),
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
  create: (fields, image, onProgress) =>
    api
      .post('/wallpapers', toFormData(fields, { image }), {
        onUploadProgress: (event) =>
          onProgress?.(event.total ? Math.round((event.loaded / event.total) * 100) : 0),
      })
      .then((r) => r.data),
  update: (id, fields, image) =>
    api.put(`/wallpapers/${id}`, toFormData(fields, { image })).then((r) => r.data),
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
