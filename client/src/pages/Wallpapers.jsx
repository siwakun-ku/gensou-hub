import { useEffect, useState } from 'react';
import { Field, Input, ErrorMessage } from '../components/FormControls.jsx';
import { wallpapersApi, mediaUrl } from '../lib/api.js';
import { formatBytes } from '../lib/format.js';

/** What a slide says, as opposed to what it shows. The image is never shared. */
const CAPTION_FIELDS = ['title', 'subtitle', 'linkUrl', 'linkLabel'];

const captionOf = (slide) =>
  Object.fromEntries(CAPTION_FIELDS.map((field) => [field, slide?.[field] ?? '']));

export default function Wallpapers() {
  const [slides, setSlides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);


  useEffect(() => {
    wallpapersApi
      .list(true)
      .then(setSlides)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function refresh() {
    setSlides(await wallpapersApi.list(true));
  }

  async function run(action) {
    setError(null);
    try {
      await action();
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  /**
   * Give every slide the same caption.
   *
   * Applies the wording verbatim, blanks included: "the same caption" has to
   * mean the same on all of them, so a field left empty clears that field
   * everywhere rather than being quietly skipped. The caller confirms first,
   * since this overwrites wording that was written per slide.
   */
  async function applyCaptionToAll(fields) {
    setError(null);

    const failed = [];
    // One at a time, so a failure can name the slide it belongs to.
    for (const slide of slides) {
      try {
        await wallpapersApi.update(slide.id, fields);
      } catch (err) {
        failed.push(`${slide.fileName}: ${err.message}`);
      }
    }

    await refresh();

    if (failed.length > 0) {
      setError(`Could not update ${failed.length} slide(s). ${failed.join('; ')}`);
      return false;
    }
    return true;
  }

  function move(index, offset) {
    const next = [...slides];
    const target = index + offset;
    if (target < 0 || target >= next.length) return;

    [next[index], next[target]] = [next[target], next[index]];
    // Show the new order straight away, then persist it.
    setSlides(next);
    run(() => wallpapersApi.reorder(next.map((slide) => slide.id)));
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Hero wallpapers</h1>
        <p className="text-sm text-slate-500">
          These images slide across the top of the home page, in the order below. Retired slides
          keep their image but stop showing to visitors.
        </p>
      </div>

      <ErrorMessage>{error}</ErrorMessage>

      <UploadForm onUploaded={refresh} nextPosition={slides.length} />

      {slides.length > 1 && <SharedCaption slides={slides} onApply={applyCaptionToAll} />}

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">
          Slides {slides.length > 0 && <span className="text-slate-400">({slides.length})</span>}
        </h2>

        {loading ? (
          <p className="text-slate-500">Loading…</p>
        ) : slides.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-10 text-center text-slate-500">
            No wallpapers yet. Upload one above and it will appear on the home page.
          </p>
        ) : (
          <ul className="space-y-3">
            {slides.map((slide, index) => (
              <SlideRow
                key={slide.id}
                slide={slide}
                isFirst={index === 0}
                isLast={index === slides.length - 1}
                onMoveUp={() => move(index, -1)}
                onMoveDown={() => move(index, 1)}
                onToggle={() =>
                  run(() => wallpapersApi.update(slide.id, { isActive: !slide.isActive }))
                }
                onSave={(fields, image) => run(() => wallpapersApi.update(slide.id, fields, image))}
                onDelete={() => {
                  if (!window.confirm('Delete this wallpaper? This cannot be undone.')) return;
                  run(() => wallpapersApi.remove(slide.id));
                }}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/**
 * One caption across the whole hero.
 *
 * A set of slides is often one message shown over changing artwork — the same
 * heading and the same button on every frame — and setting that per slide means
 * typing it as many times as there are wallpapers, then doing it again when the
 * wording changes.
 */
function SharedCaption({ slides, onApply }) {
  // Seeded from the first slide, which is usually the one already worded the
  // way the rest should be.
  const [fields, setFields] = useState(() => captionOf(slides[0]));
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);

  const update = (key) => (event) => {
    setFields((prev) => ({ ...prev, [key]: event.target.value }));
    setApplied(false);
  };

  async function handleSubmit(event) {
    event.preventDefault();

    const blanks = CAPTION_FIELDS.filter((field) => !fields[field]);
    const warning =
      blanks.length > 0
        ? ' Fields left empty will be cleared on every slide.'
        : '';

    if (!window.confirm(`Give all ${slides.length} slides this caption?${warning}`)) return;

    setApplying(true);
    const ok = await onApply(fields);
    setApplying(false);
    setApplied(ok);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-xl border border-slate-200 bg-surface p-5"
    >
      <div>
        <h2 className="text-lg font-semibold">One caption for every slide</h2>
        <p className="text-sm text-slate-500">
          Writes this wording over all {slides.length} wallpapers. Their images are untouched —
          replace those on a slide itself.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Heading" className="sm:col-span-2">
          <Input value={fields.title} onChange={update('title')} />
        </Field>
        <Field label="Subheading" className="sm:col-span-2">
          <Input value={fields.subtitle} onChange={update('subtitle')} />
        </Field>
        <Field label="Button link" hint="Leave empty for no button">
          <Input value={fields.linkUrl} onChange={update('linkUrl')} />
        </Field>
        <Field label="Button label">
          <Input value={fields.linkLabel} onChange={update('linkLabel')} />
        </Field>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={applying}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
        >
          {applying ? 'Applying…' : `Apply to all ${slides.length} slides`}
        </button>
        {applied && <span className="text-sm text-slate-500">Applied to every slide.</span>}
      </div>
    </form>
  );
}

function UploadForm({ onUploaded, nextPosition }) {
  const [fields, setFields] = useState({ title: '', subtitle: '', linkUrl: '', linkLabel: '' });
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);

  function handleImage(event) {
    const file = event.target.files?.[0] ?? null;
    setImage(file);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return file ? URL.createObjectURL(file) : null;
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!image) return setError('Choose an image first.');

    setError(null);
    setProgress(0);
    try {
      await wallpapersApi.create({ ...fields, order: nextPosition }, image, setProgress);
      setFields({ title: '', subtitle: '', linkUrl: '', linkLabel: '' });
      setImage(null);
      setPreview(null);
      event.target.reset();
      await onUploaded();
    } catch (err) {
      setError(err.message);
    } finally {
      setProgress(null);
    }
  }

  const update = (key) => (event) => setFields((prev) => ({ ...prev, [key]: event.target.value }));

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-xl border border-slate-200 bg-surface p-5"
    >
      <h2 className="text-lg font-semibold">Add a wallpaper</h2>

      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex aspect-[3/1] w-full shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50 sm:w-64">
          {preview ? (
            <img src={preview} alt="Wallpaper preview" className="size-full object-cover" />
          ) : (
            <span className="px-2 text-center text-xs text-slate-400">
              Wide images work best (about 3:1)
            </span>
          )}
        </div>

        <div className="flex-1 space-y-3">
          <Field label="Image" hint="JPEG, PNG, WebP or GIF">
            <input
              type="file"
              accept="image/*"
              onChange={handleImage}
              required
              className="w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700 dark:file:text-brand-300"
            />
          </Field>

          <Field label="Heading" hint="Optional text shown over the image">
            <Input value={fields.title} onChange={update('title')} />
          </Field>

          <Field label="Subheading">
            <Input value={fields.subtitle} onChange={update('subtitle')} />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Button link" hint="e.g. /albums/<id>">
              <Input value={fields.linkUrl} onChange={update('linkUrl')} />
            </Field>
            <Field label="Button label">
              <Input
                value={fields.linkLabel}
                onChange={update('linkLabel')}
                placeholder="Listen now"
              />
            </Field>
          </div>
        </div>
      </div>

      <ErrorMessage>{error}</ErrorMessage>

      {progress !== null && (
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full bg-brand-600 transition-[width]" style={{ width: `${progress}%` }} />
        </div>
      )}

      <button
        type="submit"
        disabled={progress !== null}
        className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
      >
        {progress !== null ? `Uploading… ${progress}%` : 'Add wallpaper'}
      </button>
    </form>
  );
}

function SlideRow({ slide, isFirst, isLast, onMoveUp, onMoveDown, onToggle, onSave, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState({
    title: slide.title,
    subtitle: slide.subtitle,
    linkUrl: slide.linkUrl,
    linkLabel: slide.linkLabel,
  });
  const [replacement, setReplacement] = useState(null);

  const update = (key) => (event) => setFields((prev) => ({ ...prev, [key]: event.target.value }));

  async function handleSave(event) {
    event.preventDefault();
    await onSave(fields, replacement);
    setReplacement(null);
    setEditing(false);
  }

  return (
    <li
      className={`overflow-hidden rounded-xl border bg-surface ${
        slide.isActive ? 'border-slate-200' : 'border-slate-200 opacity-60'
      }`}
    >
      <div className="flex flex-col gap-4 p-4 sm:flex-row">
        <img
          src={mediaUrl(slide.imageUrl)}
          alt={slide.title || 'Wallpaper'}
          className="aspect-[3/1] w-full shrink-0 rounded-lg object-cover sm:w-48"
        />

        <div className="min-w-0 flex-1">
          {editing ? (
            <form onSubmit={handleSave} className="space-y-3">
              <Field label="Heading">
                <Input value={fields.title} onChange={update('title')} autoFocus />
              </Field>
              <Field label="Subheading">
                <Input value={fields.subtitle} onChange={update('subtitle')} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Button link">
                  <Input value={fields.linkUrl} onChange={update('linkUrl')} />
                </Field>
                <Field label="Button label">
                  <Input value={fields.linkLabel} onChange={update('linkLabel')} />
                </Field>
              </div>
              <Field label="Replace image" hint="Leave empty to keep the current one">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setReplacement(e.target.files?.[0] ?? null)}
                  className="w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700 dark:file:text-brand-300"
                />
              </Field>

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
                >
                  Save changes
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <>
              <p className="font-semibold">{slide.title || <span className="text-slate-400">No heading</span>}</p>
              {slide.subtitle && <p className="text-sm text-slate-600">{slide.subtitle}</p>}
              <p className="mt-1 text-xs text-slate-400">
                {slide.fileName} · {formatBytes(slide.size)} · position {slide.order + 1}
                {slide.linkUrl && ` · links to ${slide.linkUrl}`}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setEditing(true)}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Edit
                </button>
                <button
                  onClick={onToggle}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  {slide.isActive ? 'Retire' : 'Make live'}
                </button>
                <button
                  onClick={onMoveUp}
                  disabled={isFirst}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                >
                  Move up
                </button>
                <button
                  onClick={onMoveDown}
                  disabled={isLast}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                >
                  Move down
                </button>
                <button
                  onClick={onDelete}
                  className="ml-auto rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:border-red-300 hover:bg-red-50 hover:text-red-600"
                >
                  Delete
                </button>
              </div>

              {!slide.isActive && (
                <p className="mt-2 text-xs font-medium text-amber-700">
                  Retired — not shown on the home page.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </li>
  );
}
