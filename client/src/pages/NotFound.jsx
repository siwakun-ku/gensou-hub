import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <section className="space-y-3 text-center">
      <h1 className="text-3xl font-bold">404</h1>
      <p className="text-slate-600">That page does not exist.</p>
      <Link to="/" className="text-brand-600 underline">
        Back home
      </Link>
    </section>
  );
}
