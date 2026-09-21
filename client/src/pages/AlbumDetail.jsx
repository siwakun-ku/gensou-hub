import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import CoverArt from '../components/CoverArt.jsx';
import TrackList from '../components/TrackList.jsx';
import TrackUploadForm from '../components/TrackUploadForm.jsx';
import TrackBulkBar from '../components/TrackBulkBar.jsx';
import { circlePath } from '../lib/paths.js';
import { albumsApi, mediaUrl } from '../lib/api.js';
import { formatDuration } from '../lib/format.js';
import { usePlayer } from '../lib/PlayerContext.jsx';
import { useAuth } from '../lib/AuthContext.jsx';

export default function AlbumDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { play } = usePlayer();
  const { isAdmin, isAuthenticated } = useAuth();

  const [album, setAlbum] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Which tracks the bulk actions apply to. Empty means "the whole album".
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  const toggleSelect = useCallback((trackId) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(trackId)) next.delete(trackId);
      else next.add(trackId);
      return next;
    });
  }, []);

  useEffect(() => {
    setLoading(true);
    albumsApi
      .get(id)
      .then(setAlbum)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  async function refresh() {
    setAlbum(await albumsApi.get(id));
  }

  async function handleDeleteTrack(track) {
    if (!window.confirm(`Delete "${track.title}"? This cannot be undone.`)) return;
    try {
      await albumsApi.removeTrack(album.id, track.id);
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteAlbum() {
    if (!window.confirm(`Delete "${album.title}" and all of its tracks?`)) return;
    try {
      await albumsApi.remove(album.id);
      navigate('/');
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) return <p className="text-slate-500">Loading album…</p>;
  if (error && !album)
    return (
      <div className="space-y-3">
        <p className="rounded-md bg-red-50 px-3 py-2 text-red-700">{error}</p>
        <Link to="/" className="text-brand-600 underline">
          Back to albums
        </Link>
      </div>
    );
  if (!album) return null;

  return (
    <section className="space-y-8">
      <header className="flex flex-col gap-6 sm:flex-row">
        <CoverArt album={album} className="aspect-square w-full rounded-xl sm:w-56" />

        <div className="flex flex-1 flex-col justify-end gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Album</p>
            <h1 className="text-3xl font-bold">{album.title}</h1>
            {/* The circle has a page of its own, and the name on the album is
                the obvious way to reach it. */}
            <Link
              to={circlePath(album.circle)}
              className="text-lg text-slate-600 underline decoration-slate-300 underline-offset-4 transition hover:text-brand-600 hover:decoration-brand-400"
            >
              {album.circle}
            </Link>
          </div>

          <p className="text-sm text-slate-500">
            {[
              album.year,
              album.genre,
              `${album.trackCount} ${album.trackCount === 1 ? 'track' : 'tracks'}`,
              album.totalDuration > 0 && formatDuration(album.totalDuration),
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>

          {album.description && <p className="text-slate-600">{album.description}</p>}

          <div className="flex flex-wrap gap-2">
            <button
              disabled={album.tracks.length === 0}
              onClick={() => play(album.tracks[0], album)}
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Play album
            </button>
            {/* A plain link, not a fetch: the browser streams the zip straight
                to disk instead of buffering an entire album in memory. */}
            {album.downloadUrl && (
              <a
                href={mediaUrl(album.downloadUrl)}
                download
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 dark:hover:text-brand-300"
              >
                Download album
              </a>
            )}
            {isAdmin && (
              <Link
                to={`/albums/${album.id}/edit`}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 dark:hover:text-brand-300"
              >
                Edit album
              </Link>
            )}
            {isAdmin && (
              <button
                onClick={handleDeleteAlbum}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-red-300 hover:bg-red-50 hover:text-red-600"
              >
                Delete album
              </button>
            )}
          </div>
        </div>
      </header>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Tracks</h2>

        <TrackBulkBar
          tracks={album.tracks}
          // These tracks are exactly one record, so "all of them" can travel
          // as the album's id rather than a list.
          albumId={album.id}
          selectedIds={selectedIds}
          onSelectAll={() => setSelectedIds(new Set(album.tracks.map((track) => track.id)))}
          onClear={() => setSelectedIds(new Set())}
        />

        <TrackList
          album={album}
          canManage={isAdmin}
          onDelete={handleDeleteTrack}
          onSaved={refresh}
          // Ticking tracks only means something when there is somewhere to put
          // them, and the bar that acts on them hides itself when signed out.
          selectedIds={isAuthenticated ? selectedIds : null}
          onToggleSelect={toggleSelect}
        />
      </div>

      {isAdmin && (
        <TrackUploadForm album={album} onUploaded={refresh} />
      )}
    </section>
  );
}
