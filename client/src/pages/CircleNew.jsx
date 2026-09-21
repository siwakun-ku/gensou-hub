import { useNavigate, useSearchParams } from 'react-router-dom';
import CircleForm from '../components/CircleForm.jsx';
import { circlePath } from '../lib/paths.js';
import { circlesApi } from '../lib/api.js';

export default function CircleNew() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Arriving from a circle that has albums but nothing written about it: the
  // name comes along so it does not have to be retyped to match exactly.
  const initialName = searchParams.get('name') ?? '';

  async function handleSubmit({ fields, logo }) {
    const circle = await circlesApi.create(fields, logo);
    navigate(circlePath(circle.name));
  }

  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Add a circle</h1>
        <p className="text-sm text-slate-500">
          Albums already name their circle, so this is not what puts one in the library — it is
          what the library knows about them beyond the name.
        </p>
      </div>

      <CircleForm
        initialName={initialName}
        onSubmit={handleSubmit}
        submitLabel="Create circle"
        savingLabel="Creating…"
        cancelTo={initialName ? circlePath(initialName) : '/circles'}
      />
    </section>
  );
}
