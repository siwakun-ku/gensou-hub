import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Field, Input, ErrorMessage } from './FormControls.jsx';
import { mediaUrl } from '../lib/api.js';

const EMPTY = { name: '', origin: '', foundedYear: '', description: '' };

/**
 * A circle's details, for writing one up or editing what is written.
 *
 * Shared by both screens for the same reason the album form is: an edit screen
 * that drifts from the create screen is how a circle ends up with a field only
 * one of them can set.
 *
 * `onSubmit({ fields, logo, removeLogo })` does whichever it is.
 */
export default function CircleForm({
  circle = null,
  initialName = '',
  onSubmit,
  submitLabel,
  savingLabel,
  cancelTo = '/circles',
}) {
  const [fields, setFields] = useState(() =>
    circle
      ? {
          name: circle.name ?? '',
          origin: circle.origin ?? '',
          // The input is text; null would make React call the field uncontrolled.
          foundedYear: circle.foundedYear ? String(circle.foundedYear) : '',
          description: circle.description ?? '',
        }
      : { ...EMPTY, name: initialName }
  );
  const [links, setLinks] = useState(() => circle?.links ?? []);
  const [logo, setLogo] = useState(null);
  const [preview, setPreview] = useState(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // A chosen file is previewed from an object URL, which has to be handed back
  // or the page leaks one per pick.
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  const existingLogo = circle?.logoUrl ? mediaUrl(circle.logoUrl) : null;
  const shownLogo = preview ?? (removeLogo ? null : existingLogo);

  function handleLogo(event) {
    const file = event.target.files?.[0] ?? null;
    setLogo(file);
    setRemoveLogo(false);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return file ? URL.createObjectURL(file) : null;
    });
  }

  function handleRemoveLogo() {
    setLogo(null);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
    setRemoveLogo(true);
  }

  const updateLink = (index, key) => (event) =>
    setLinks((prev) =>
      prev.map((link, i) => (i === index ? { ...link, [key]: event.target.value } : link))
    );

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      // Half-filled rows are dropped here as well as on the server, so what is
      // sent matches what the admin can see they filled in.
      const usable = links.filter((link) => link.label.trim() && link.url.trim());
      await onSubmit({ fields: { ...fields, links: usable }, logo, removeLogo });
    } catch (err) {
      setError(err.message);
      // Only on failure: a success navigates away, and setting state on a form
      // that is already gone warns.
      setSaving(false);
    }
  }

  const update = (key) => (event) => setFields((prev) => ({ ...prev, [key]: event.target.value }));

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-xl border border-slate-200 bg-surface p-5"
    >
      <div className="flex gap-4">
        <div className="flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50">
          {shownLogo ? (
            <img src={shownLogo} alt="Logo preview" className="size-full object-cover" />
          ) : (
            <span className="px-2 text-center text-xs text-slate-400">No logo</span>
          )}
        </div>

        <Field
          label="Logo"
          hint={
            circle
              ? 'JPEG, PNG, WebP or GIF. Leave empty to keep the current logo.'
              : 'JPEG, PNG, WebP or GIF'
          }
          className="flex-1"
        >
          <input
            type="file"
            accept="image/*"
            onChange={handleLogo}
            className="w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700 dark:file:text-brand-300"
          />
          {shownLogo && (
            <button
              type="button"
              onClick={handleRemoveLogo}
              className="mt-2 text-xs font-medium text-slate-500 underline transition hover:text-red-600"
            >
              Remove logo
            </button>
          )}
          {removeLogo && (
            <p className="mt-1 text-xs text-amber-700">The logo will be removed when you save.</p>
          )}
        </Field>
      </div>

      <Field
        label="Name"
        hint={
          circle
            ? 'Renaming the circle renames it on every album crediting it.'
            : 'Must match the circle named on their albums, letter for letter.'
        }
      >
        <Input value={fields.name} onChange={update('name')} required />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Origin" hint="A city or a region, however they describe it">
          <Input value={fields.origin} onChange={update('origin')} placeholder="Tokyo" />
        </Field>
        <Field label="Founded">
          <Input
            type="number"
            min={1900}
            max={new Date().getFullYear() + 1}
            value={fields.foundedYear}
            onChange={update('foundedYear')}
          />
        </Field>
      </div>

      <Field label="About">
        <textarea
          value={fields.description}
          onChange={update('description')}
          rows={5}
          placeholder="Who they are, how they formed, what they sound like…"
          className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
        />
      </Field>

      <fieldset className="space-y-2">
        <legend className="mb-1 block text-sm font-medium text-slate-700">Links</legend>
        <p className="text-xs text-slate-400">
          Where to find them — an official site, a Bandcamp, a socials account.
        </p>

        {links.map((link, index) => (
          <div key={index} className="flex gap-2">
            <input
              value={link.label}
              onChange={updateLink(index, 'label')}
              placeholder="Bandcamp"
              aria-label={`Link ${index + 1} label`}
              className="w-32 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
            />
            <input
              type="url"
              value={link.url}
              onChange={updateLink(index, 'url')}
              placeholder="https://example.com"
              aria-label={`Link ${index + 1} URL`}
              className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
            />
            <button
              type="button"
              onClick={() => setLinks((prev) => prev.filter((_, i) => i !== index))}
              aria-label={`Remove link ${index + 1}`}
              className="rounded-md border border-slate-300 px-3 text-sm text-slate-500 transition hover:border-red-300 hover:bg-red-50 hover:text-red-600"
            >
              Remove
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={() => setLinks((prev) => [...prev, { label: '', url: '' }])}
          className="rounded-md border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-500 transition hover:border-brand-300 hover:text-brand-600"
        >
          Add a link
        </button>
      </fieldset>

      <ErrorMessage>{error}</ErrorMessage>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? savingLabel : submitLabel}
        </button>
        <Link
          to={cancelTo}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
