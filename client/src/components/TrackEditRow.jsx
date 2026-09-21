import { useState } from 'react';
import { Field, Input, ErrorMessage } from './FormControls.jsx';
import { albumsApi } from '../lib/api.js';
import { formatDuration, parseDuration } from '../lib/format.js';

/**
 * Inline editor for one track's information. Replaces the row in place so the
 * admin keeps the rest of the album in view while editing.
 */
export default function TrackEditRow({ album, track, onCancel, onSaved }) {
  const [fields, setFields] = useState({
    title: track.title,
    trackNumber: String(track.trackNumber),
    // Edited as text and sent as text; the API splits it back into a list.
    contributingArtists: (track.contributingArtists ?? []).join(', '),
    duration: track.duration ? formatDuration(track.duration) : '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();

    const seconds = parseDuration(fields.duration);
    if (seconds === null) return setError('Length must look like 3:34, 1:02:03 or a number of seconds.');

    const trackNumber = Number(fields.trackNumber);
    if (!Number.isInteger(trackNumber) || trackNumber < 1) {
      return setError('Track number must be a whole number of 1 or more.');
    }

    setSaving(true);
    setError(null);
    try {
      await albumsApi.updateTrack(album.id, track.id, {
        title: fields.title,
        contributingArtists: fields.contributingArtists,
        trackNumber,
        duration: seconds,
      });
      // The album is reloaded by the parent, since a new track number reorders it.
      await onSaved?.();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  const update = (key) => (event) => setFields((prev) => ({ ...prev, [key]: event.target.value }));

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-6">
        <Field label="Title" className="sm:col-span-3">
          <Input value={fields.title} onChange={update('title')} required autoFocus />
        </Field>

        <Field label="Track no." className="sm:col-span-1">
          <Input
            type="number"
            min={1}
            step={1}
            value={fields.trackNumber}
            onChange={update('trackNumber')}
            required
          />
        </Field>

        <Field label="Length" hint="mm:ss" className="sm:col-span-2">
          <Input value={fields.duration} onChange={update('duration')} placeholder="3:34" />
        </Field>

        <Field
          label="Contributing artists"
          hint={`Separate each name with a comma. Leave blank to credit ${album.circle}.`}
          className="sm:col-span-6"
        >
          <Input
            value={fields.contributingArtists}
            onChange={update('contributingArtists')}
            placeholder="Aoi, Mizuki"
          />
        </Field>
      </div>

      <ErrorMessage>{error}</ErrorMessage>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-surface disabled:opacity-50"
        >
          Cancel
        </button>
        <span className="ml-auto text-xs text-slate-400">{track.fileName}</span>
      </div>
    </form>
  );
}
