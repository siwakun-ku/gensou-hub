import { useRef, useState } from 'react';
import { Field, Input, ErrorMessage } from './FormControls.jsx';
import { albumsApi } from '../lib/api.js';
import { readAudioDuration, formatDuration } from '../lib/format.js';
import { readTrackTags } from '../lib/metadata.js';

/**
 * Adds one or many tracks to an album.
 *
 * Choosing files queues them as editable rows, each filled in from the tags the
 * file already carries, so a whole record can go up in one pass with only the
 * corrections typed by hand.
 */
export default function TrackUploadForm({ album, onUploaded }) {
  const [entries, setEntries] = useState([]);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const fileInput = useRef(null);

  const updateEntry = (id, patch) =>
    setEntries((all) => all.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));

  async function handleFiles(event) {
    const chosen = [...(event.target.files ?? [])];
    // Let the same file be picked again after being removed from the queue.
    event.target.value = '';
    if (chosen.length === 0) return;

    setReading(true);
    setError(null);

    // Numbering carries on from what the album already holds plus anything
    // already queued, for files whose tags do not say where they belong.
    const base = album.trackCount + entries.length;

    const read = await Promise.all(
      chosen.map(async (file, index) => {
        const tags = await readTrackTags(file);

        return {
          id: crypto.randomUUID(),
          file,
          title: tags?.title || file.name.replace(/\.[^.]+$/, ''),
          trackNumber: String(tags?.trackNumber || base + index + 1),
          contributingArtists: (tags?.contributingArtists ?? []).join(', '),
          // The tags usually carry the length; decoding is the fallback for a
          // format the parser could not read.
          duration: tags?.duration || (await readAudioDuration(file)),
          detected: tags?.album || tags?.year ? { album: tags.album, year: tags.year } : null,
          status: 'pending',
          progress: 0,
          message: null,
        };
      })
    );

    setEntries((all) => [...all, ...read]);
    setReading(false);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (entries.length === 0) return setError('Choose one or more audio files first.');

    setBusy(true);
    setError(null);

    const failed = [];

    // One at a time, not in parallel: each upload saves the album document, so
    // overlapping writes would race, and a track left without a number takes
    // its position from however many tracks the album has at that moment.
    for (const entry of entries) {
      updateEntry(entry.id, { status: 'uploading', progress: 0, message: null });

      try {
        await albumsApi.addTrack(
          album.id,
          {
            title: entry.title,
            trackNumber: entry.trackNumber || undefined,
            contributingArtists: entry.contributingArtists,
            duration: entry.duration || undefined,
          },
          entry.file,
          (progress) => updateEntry(entry.id, { progress })
        );
        updateEntry(entry.id, { status: 'done', progress: 100 });
      } catch (err) {
        // One bad file must not strand the rest of the queue.
        failed.push(entry.id);
        updateEntry(entry.id, { status: 'error', message: err.message });
      }
    }

    // Whatever went up is now on the album; what is left is what still needs
    // attention, so a retry is one more click rather than a re-pick.
    setEntries((all) => all.filter((entry) => failed.includes(entry.id)));
    setBusy(false);

    if (failed.length > 0) {
      setError(
        `${failed.length} of ${entries.length} ${
          entries.length === 1 ? 'track' : 'tracks'
        } could not be uploaded. The rest were added.`
      );
    }

    await onUploaded?.();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-xl border border-slate-200 bg-surface p-5"
    >
      <div>
        <h2 className="text-lg font-semibold">Add tracks</h2>
        <p className="text-sm text-slate-500">
          Choose as many files as you like — each one is filled in from its own tags.
        </p>
      </div>

      <Field label="Audio files">
        <input
          ref={fileInput}
          type="file"
          accept="audio/*"
          multiple
          onChange={handleFiles}
          disabled={busy}
          className="w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700 dark:file:text-brand-300 hover:file:bg-brand-50/70"
        />
        {reading && <p className="mt-1 text-xs text-slate-500">Reading track details…</p>}
      </Field>

      {entries.length > 0 && (
        <ul className="space-y-3">
          {entries.map((entry, index) => (
            <li
              key={entry.id}
              className={`rounded-lg border p-3 ${
                entry.status === 'error' ? 'border-red-200 bg-red-50/50' : 'border-slate-200'
              }`}
            >
              <div className="mb-2 flex items-center gap-2">
                <span className="text-xs font-medium text-slate-400">#{index + 1}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-slate-500">
                  {entry.file.name}
                  {entry.duration > 0 && ` · ${formatDuration(entry.duration)}`}
                </span>
                <button
                  type="button"
                  onClick={() => setEntries((all) => all.filter((e) => e.id !== entry.id))}
                  disabled={busy}
                  title={`Remove ${entry.file.name} from the queue`}
                  className="shrink-0 rounded p-1 text-slate-300 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                >
                  <RemoveIcon />
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-6">
                <Field label="Title" className="sm:col-span-3">
                  <Input
                    value={entry.title}
                    onChange={(e) => updateEntry(entry.id, { title: e.target.value })}
                    disabled={busy}
                    required
                  />
                </Field>

                <Field label="Track no." className="sm:col-span-1">
                  <Input
                    type="number"
                    min={1}
                    value={entry.trackNumber}
                    onChange={(e) => updateEntry(entry.id, { trackNumber: e.target.value })}
                    disabled={busy}
                  />
                </Field>

                <Field label="Contributing artists" className="sm:col-span-2">
                  <Input
                    value={entry.contributingArtists}
                    onChange={(e) =>
                      updateEntry(entry.id, { contributingArtists: e.target.value })
                    }
                    disabled={busy}
                    placeholder={album.circle}
                  />
                </Field>
              </div>

              {/* The album and its year belong to the album, not the track, so
                  these are shown rather than filled in — and only when the file
                  disagrees, since matching tags are not worth the words. */}
              {entry.detected && !matchesAlbum(entry.detected, album) && (
                <p className="mt-2 text-xs text-amber-700">
                  Tagged {[entry.detected.album, entry.detected.year].filter(Boolean).join(', ')} —
                  it will still be added to {album.title}
                  {album.year ? ` (${album.year})` : ''}.
                </p>
              )}

              {entry.status === 'uploading' && (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full bg-brand-600 transition-[width]"
                    style={{ width: `${entry.progress}%` }}
                  />
                </div>
              )}

              {entry.message && <p className="mt-2 text-xs text-red-600">{entry.message}</p>}
            </li>
          ))}
        </ul>
      )}

      <ErrorMessage>{error}</ErrorMessage>

      <button
        type="submit"
        disabled={busy || reading || entries.length === 0}
        className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy
          ? 'Uploading…'
          : `Upload ${entries.length || ''} ${entries.length === 1 ? 'track' : 'tracks'}`.trim()}
      </button>
    </form>
  );
}

/** Whether the file's own album tags agree with the album it is being added to. */
function matchesAlbum(detected, album) {
  const sameTitle = !detected.album || detected.album.toLowerCase() === album.title.toLowerCase();
  const sameYear = !detected.year || !album.year || detected.year === album.year;

  return sameTitle && sameYear;
}

function RemoveIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-4"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
