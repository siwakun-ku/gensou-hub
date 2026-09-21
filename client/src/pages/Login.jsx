import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Field, Input, ErrorMessage } from '../components/FormControls.jsx';
import AuthPanel from '../components/AuthPanel.jsx';
import { useAuth } from '../lib/AuthContext.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [fields, setFields] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Where the guard bounced them from, so they land back there after signing in.
  const destination = location.state?.from?.pathname ?? '/';

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(fields);
      navigate(destination, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const update = (key) => (event) => setFields((prev) => ({ ...prev, [key]: event.target.value }));

  return (
    <AuthPanel title="Welcome back" blurb="Sign in to reach your favourites and your playlists.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Email">
          <Input
            type="email"
            value={fields.email}
            onChange={update('email')}
            autoComplete="email"
            required
          />
        </Field>

        <Field label="Password">
          <Input
            type="password"
            value={fields.password}
            onChange={update('password')}
            autoComplete="current-password"
            required
          />
        </Field>

        <ErrorMessage>{error}</ErrorMessage>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </AuthPanel>
  );
}
