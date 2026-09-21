import { useNavigate } from 'react-router-dom';
import AlbumForm from '../components/AlbumForm.jsx';
import { albumsApi } from '../lib/api.js';

export default function AlbumNew() {
  const navigate = useNavigate();

  async function handleSubmit({ fields, cover }) {
    const album = await albumsApi.create(fields, cover);
    // Straight to the album page, where tracks get uploaded.
    navigate(`/albums/${album.id}`);
  }

  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">New album</h1>
        <p className="text-sm text-slate-500">Create the album first, then add its tracks.</p>
      </div>

      <AlbumForm onSubmit={handleSubmit} submitLabel="Create album" savingLabel="Creating…" />
    </section>
  );
}
