import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AlbumForm from '../components/AlbumForm.jsx';
import { ErrorMessage } from '../components/FormControls.jsx';
import { albumsApi } from '../lib/api.js';

export default function AlbumEdit() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [album, setAlbum] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // The form fills itself in from the album, so it cannot be rendered until
  // the album is here.
  useEffect(() => {
    let cancelled = false;

    albumsApi
      .get(id)
      .then((data) => !cancelled && setAlbum(data))
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleSubmit({ fields, cover, removeCover }) {
    // removeCover travels as an ordinary field: the request is multipart, and
    // an untouched file input sends nothing at all, so "clear it" needs saying
    // out loud rather than being inferred from an absent file.
    await albumsApi.update(id, removeCover ? { ...fields, removeCover: 'true' } : fields, cover);
    navigate(`/albums/${id}`);
  }

  if (loading) return <p className="text-slate-500">Loading album…</p>;

  if (!album) {
    return (
      <div className="space-y-3">
        <ErrorMessage>{error ?? 'Album not found'}</ErrorMessage>
        <Link to="/" className="text-brand-600 underline">
          Back to albums
        </Link>
      </div>
    );
  }

  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Edit album</h1>
        <p className="text-sm text-slate-500">
          Changing these details updates every track on{' '}
          <Link to={`/albums/${id}`} className="underline hover:text-brand-600">
            {album.title}
          </Link>
          , which take their circle and year from the album.
        </p>
      </div>

      <AlbumForm
        album={album}
        onSubmit={handleSubmit}
        submitLabel="Save changes"
        savingLabel="Saving…"
        cancelTo={`/albums/${id}`}
      />
    </section>
  );
}
