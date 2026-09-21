import { useEffect, useState } from 'react';
import { Field, Input, ErrorMessage } from '../components/FormControls.jsx';
import { recommendationsApi, albumsApi } from '../lib/api.js';
import { albumLine, creditLine } from '../components/TrackMeta.jsx';
import { formatDuration } from '../lib/format.js';

export default function Recommendations() {
  const [mode, setMode] = useState('random');
  const [limit, setLimit] = useState(6);
  // Picks are held with their titles so the list stays readable without
  // re-resolving every id on each render.
  const [picks, setPicks] = useState([]);
  const [albums, setAlbums] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [settings, albumList] = await Promise.all([
          recommendationsApi.getSettings(),
          albumsApi.list({ limit: 100 }),
        ]);

        setMode(settings.mode);
        setLimit(settings.limit);
        setAlbums(albumList.data);

        // Turn stored ids back into something displayable, skipping anything
        // that has been deleted since it was picked.
        const detailed = await Promise.all(
          settings.picks.map(async (pick) => {
            try {
              const album = await albumsApi.get(pick.albumId);
              const track = album.tracks.find((t) => t.id === pick.trackId);
              return track ? toPick(album, track) : null;
            } catch {
              return null;
            }
          })
        );
        setPicks(detailed.filter(Boolean));
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await recommendationsApi.updateSettings({
        mode,
        limit: Number(limit),
        picks: picks.map(({ albumId, trackId }) => ({ albumId, trackId })),
      });
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function addPick(album, track) {
    setSaved(false);
    setPicks((prev) =>
      // Ignore a track that is already in the list.
      prev.some((p) => p.trackId === track.id) ? prev : [...prev, toPick(album, track)]
    );
  }

  function movePick(index, offset) {
    const target = index + offset;
    if (target < 0 || target >= picks.length) return;

    const next = [...picks];
    [next[index], next[target]] = [next[target], next[index]];
    setPicks(next);
    setSaved(false);
  }

  if (loading) return <p className="text-slate-500">Loading…</p>;

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Recommended tracks</h1>
        <p className="text-sm text-slate-500">
          The strip shown under the hero on the home page.
        </p>
      </div>

      <ErrorMessage>{error}</ErrorMessage>

      <div className="space-y-4 rounded-xl border border-slate-200 bg-surface p-5">
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium text-slate-700">How tracks are chosen</legend>

          <ModeOption
            value="random"
            checked={mode === 'random'}
            onChange={setMode}
            title="Random"
            description="A fresh selection from the whole library on every visit."
          />
          <ModeOption
            value="fixed"
            checked={mode === 'fixed'}
            onChange={setMode}
            title="Fixed"
            description="Exactly the tracks you choose below, in your order."
          />
        </fieldset>

        <Field label="How many to show" className="max-w-40">
          <Input
            type="number"
            min={1}
            max={24}
            value={limit}
            onChange={(e) => {
              setLimit(e.target.value);
              setSaved(false);
            }}
          />
        </Field>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          {saved && <span className="text-sm text-emerald-600">Saved.</span>}
        </div>
      </div>

      {mode === 'fixed' && (
        <>
          <ChosenTracks
            picks={picks}
            limit={Number(limit)}
            onRemove={(trackId) => {
              setPicks((prev) => prev.filter((p) => p.trackId !== trackId));
              setSaved(false);
            }}
            onMove={movePick}
          />
          <TrackPicker albums={albums} picks={picks} onAdd={addPick} />
        </>
      )}
    </section>
  );
}

const toPick = (album, track) => ({
  albumId: album.id,
  trackId: track.id,
  title: track.title,
  // Whoever is credited on the track, which is the circle unless the track
  // names its own contributors.
  credits: creditLine(track),
  albumTitle: album.title,
  albumCircle: album.circle,
  duration: track.duration,
});

function ModeOption({ value, checked, onChange, title, description }) {
  return (
    <label
      className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition ${
        checked ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:bg-slate-50'
      }`}
    >
      <input
        type="radio"
        name="mode"
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        className="mt-1 accent-brand-600"
      />
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-slate-500">{description}</span>
      </span>
    </label>
  );
}

function ChosenTracks({ picks, limit, onRemove, onMove }) {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">
        Chosen tracks <span className="text-slate-400">({picks.length})</span>
      </h2>

      {picks.length > limit && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Only the first {limit} will be shown. Raise the limit or remove some.
        </p>
      )}

      {picks.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-slate-500">
          Nothing chosen yet — the strip will be empty. Add tracks below.
        </p>
      ) : (
        <ol className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-surface">
          {picks.map((pick, index) => (
            <li key={pick.trackId} className="flex items-center gap-3 px-4 py-3">
              <span
                className={`w-6 text-right text-sm tabular-nums ${
                  index < limit ? 'text-slate-400' : 'text-amber-500'
                }`}
              >
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{pick.title}</p>
                <p className="truncate text-xs text-slate-500">
                  {pick.credits} · {albumLine(pick, pick.credits)}
                </p>
              </div>
              <span className="text-xs tabular-nums text-slate-400">
                {formatDuration(pick.duration)}
              </span>
              <button
                onClick={() => onMove(index, -1)}
                disabled={index === 0}
                className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                Up
              </button>
              <button
                onClick={() => onMove(index, 1)}
                disabled={index === picks.length - 1}
                className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                Down
              </button>
              <button
                onClick={() => onRemove(pick.trackId)}
                className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:border-red-300 hover:bg-red-50 hover:text-red-600"
              >
                Remove
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function TrackPicker({ albums, picks, onAdd }) {
  const [albumId, setAlbumId] = useState('');
  const [album, setAlbum] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!albumId) return setAlbum(null);

    let cancelled = false;
    setLoading(true);
    albumsApi
      .get(albumId)
      .then((data) => !cancelled && setAlbum(data))
      .catch(() => !cancelled && setAlbum(null))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [albumId]);

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-surface p-5">
      <h2 className="text-lg font-semibold">Add a track</h2>

      <Field label="Album">
        <select
          value={albumId}
          onChange={(e) => setAlbumId(e.target.value)}
          className="w-full rounded-md border border-slate-300 bg-surface px-3 py-2 text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
        >
          <option value="">Choose an album…</option>
          {albums.map((option) => (
            <option key={option.id} value={option.id}>
              {option.title} — {option.circle}
            </option>
          ))}
        </select>
      </Field>

      {loading && <p className="text-sm text-slate-500">Loading tracks…</p>}

      {album && !loading && (
        album.tracks.length === 0 ? (
          <p className="text-sm text-slate-500">This album has no tracks yet.</p>
        ) : (
          <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200">
            {album.tracks.map((track) => {
              const already = picks.some((p) => p.trackId === track.id);

              return (
                <li key={track.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="w-5 text-right text-xs tabular-nums text-slate-400">
                    {track.trackNumber}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">{track.title}</span>
                  <span className="text-xs tabular-nums text-slate-400">
                    {formatDuration(track.duration)}
                  </span>
                  <button
                    onClick={() => onAdd(album, track)}
                    disabled={already}
                    className="rounded-md bg-brand-600 px-3 py-1 text-xs font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                  >
                    {already ? 'Added' : 'Add'}
                  </button>
                </li>
              );
            })}
          </ul>
        )
      )}
    </div>
  );
}
