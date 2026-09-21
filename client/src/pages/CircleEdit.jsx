import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import CircleForm from '../components/CircleForm.jsx';
import { ErrorMessage } from '../components/FormControls.jsx';
import { circlePath } from '../lib/paths.js';
import { circlesApi } from '../lib/api.js';

export default function CircleEdit() {
  const { name } = useParams();
  const navigate = useNavigate();

  const [circle, setCircle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // The form fills itself in from the circle, so it cannot be rendered until
  // the circle is here.
  useEffect(() => {
    let cancelled = false;

    circlesApi
      .get(name)
      .then((data) => !cancelled && setCircle(data))
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [name]);

  async function handleSubmit({ fields, logo, removeLogo }) {
    // removeLogo travels as an ordinary field: the request is multipart, and an
    // untouched file input sends nothing at all, so "clear it" needs saying out
    // loud rather than being inferred from an absent file.
    const saved = await circlesApi.update(
      circle.id,
      removeLogo ? { ...fields, removeLogo: 'true' } : fields,
      logo
    );

    // A rename changes the circle's address, so the page to land on is the one
    // under the new name.
    navigate(circlePath(saved.name));
  }

  if (loading) return <p className="text-slate-500">Loading circle…</p>;

  // Editing needs a profile to edit. A circle known only from its albums has
  // none yet, so it is sent to the form that writes the first one.
  if (circle && !circle.hasProfile) {
    return (
      <div className="space-y-3">
        <ErrorMessage>Nothing is written about {circle.name} yet.</ErrorMessage>
        <Link
          to={`/admin/circles/new?name=${encodeURIComponent(circle.name)}`}
          className="text-brand-600 underline"
        >
          Write a profile for them
        </Link>
      </div>
    );
  }

  if (!circle) {
    return (
      <div className="space-y-3">
        <ErrorMessage>{error ?? 'Circle not found'}</ErrorMessage>
        <Link to="/circles" className="text-brand-600 underline">
          Back to circles
        </Link>
      </div>
    );
  }

  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Edit circle</h1>
        <p className="text-sm text-slate-500">
          {circle.albumCount > 0 ? (
            <>
              Renaming{' '}
              <Link to={circlePath(circle.name)} className="underline hover:text-brand-600">
                {circle.name}
              </Link>{' '}
              also renames them on all {circle.albumCount} of their albums, so nothing is left
              crediting the old name.
            </>
          ) : (
            'No album credits this circle yet, so a rename affects nothing else.'
          )}
        </p>
      </div>

      <CircleForm
        circle={circle}
        onSubmit={handleSubmit}
        submitLabel="Save changes"
        savingLabel="Saving…"
        cancelTo={circlePath(circle.name)}
      />
    </section>
  );
}
