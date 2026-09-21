import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Field, Input, ErrorMessage } from './FormControls.jsx';
import { mediaUrl } from '../lib/api.js';

const EMPTY = { title: '', circle: '', year: '', genre: '', description: '' };

/**
 * The album's details, for creating one or editing one.
 *
 * Both do the same job on the same fields, so they share a form: an edit screen
 * that drifts from the create screen is how an album ends up with a field only
 * one of them can set.
 *
 * `onSubmit({ fields, cover, removeCover })` does whichever it is; this only
 * collects the answer.
 */
export default function AlbumForm({
  album = null,
  onSubmit,
  submitLabel,
  savingLabel,
  cancelTo = '/',
}) {
  const [fields, setFields] = useState(() =>
    album
      ? {
          title: album.title ?? '',
          circle: album.circle ?? '',
          // The inputs are text; null has to become "" or React calls the
          // field uncontrolled.
          year: album.year ? String(album.year) : '',
          genre: album.genre ?? '',
          description: album.description ?? '',
        }
      : EMPTY
  );
  const [cover, setCover] = useState(null);
  const [preview, setPreview] = useState(null);
  const [removeCover, setRemoveCover] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // A chosen file is previewed from an object URL, which has to be handed back
  // or the page leaks one per pick.
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  const existingCover = album?.coverUrl ? mediaUrl(album.coverUrl) : null;
  const shownCover = preview ?? (removeCover ? null : existingCover);

  function handleCover(event) {
    const file = event.target.files?.[0] ?? null;
    setCover(file);
    setRemoveCover(false);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return file ? URL.createObjectURL(file) : null;
    });
  }

  function handleRemoveCover() {
    setCover(null);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
    setRemoveCover(true);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ fields, cover, removeCover });
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
          {shownCover ? (
            <img src={shownCover} alt="Cover preview" className="size-full object-cover" />
          ) : (
            <span className="px-2 text-center text-xs text-slate-400">No cover</span>
          )}
        </div>

        <Field
          label="Cover art"
          hint={
            album
              ? 'JPEG, PNG, WebP or GIF. Leave empty to keep the current art.'
              : 'JPEG, PNG, WebP or GIF'
          }
          className="flex-1"
        >
          <input
            type="file"
            accept="image/*"
            onChange={handleCover}
            className="w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700 dark:file:text-brand-300"
          />
          {shownCover && (
            <button
              type="button"
              onClick={handleRemoveCover}
              className="mt-2 text-xs font-medium text-slate-500 underline transition hover:text-red-600"
            >
              Remove cover
            </button>
          )}
          {removeCover && (
            <p className="mt-1 text-xs text-amber-700">
              The cover will be removed when you save.
            </p>
          )}
        </Field>
      </div>

      <Field label="Title">
        <Input value={fields.title} onChange={update('title')} required />
      </Field>

      <Field label="Circle" hint="The group that released the album">
        <Input value={fields.circle} onChange={update('circle')} required />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Year">
          <Input
            type="number"
            min={1900}
            max={new Date().getFullYear() + 1}
            value={fields.year}
            onChange={update('year')}
          />
        </Field>
        <Field label="Genre">
          <Input value={fields.genre} onChange={update('genre')} />
        </Field>
      </div>

      <Field label="Description">
        <textarea
          value={fields.description}
          onChange={update('description')}
          rows={3}
          className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
        />
      </Field>

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
