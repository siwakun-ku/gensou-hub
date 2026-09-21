import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Field, Input, ErrorMessage } from '../components/FormControls.jsx';
import AuthPanel from '../components/AuthPanel.jsx';
import { useAuth } from '../lib/AuthContext.jsx';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [fields, setFields] = useState({
    name: '',
    email: '',
    password: '',
    confirm: '',
  });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();

    // Checked here only for a quick message; the API owns the real rules.
    if (fields.password !== fields.confirm) return setError('The passwords do not match.');
    if (fields.password.length < 8) return setError('Use at least 8 characters.');

    setSubmitting(true);
    setError(null);
    try {
      const { name, email, password } = fields;
      await register({ name, email, password });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const update = (key) => (event) => setFields((prev) => ({ ...prev, [key]: event.target.value }));

  return (
    <AuthPanel
      title="Create an account"
      blurb="It takes a moment, and nothing you star or collect is visible to anyone else."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Name">
          <Input value={fields.name} onChange={update('name')} autoComplete="name" required />
        </Field>

        <Field label="Email">
          <Input
            type="email"
            value={fields.email}
            onChange={update('email')}
            autoComplete="email"
            required
          />
        </Field>

        {/* Side by side: the pair is one decision, and splitting them across
            two full rows made a four-field form feel like five. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Password" hint="At least 8 characters">
            <Input
              type="password"
              value={fields.password}
              onChange={update('password')}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </Field>

          <Field label="Confirm">
            <Input
              type="password"
              value={fields.confirm}
              onChange={update('confirm')}
              autoComplete="new-password"
              required
            />
          </Field>
        </div>

        <ErrorMessage>{error}</ErrorMessage>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
        >
          {submitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </AuthPanel>
  );
}
