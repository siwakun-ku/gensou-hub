import mongoose from 'mongoose';
import fileSchema from './fileSchema.js';

/**
 * The name an album's `circle` string is matched against.
 *
 * Albums name their circle in free text, and the same group is written
 * "Gensou Sound" on one release and "GENSOU SOUND " on the next. Folding case
 * and edge whitespace is what lets both find the one profile.
 */
export function circleKey(name) {
  return String(name ?? '').trim().toLowerCase();
}

const linkSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true, required: true, maxlength: 60 },
    url: { type: String, trim: true, required: true, maxlength: 500 },
  },
  { _id: false }
);

/**
 * What is known about a circle, beyond its name.
 *
 * This is a profile, not an owner: an album still records its circle as a
 * string, and that string remains the truth about which group released it. A
 * circle with no profile is an ordinary state — it simply has nothing written
 * about it yet — so nothing here is required for an album to work.
 */
const circleSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'name is required'], trim: true, maxlength: 200 },
    // Derived from the name and kept in step by the hook below. Its index is
    // declared below rather than here, so there is only one of it.
    key: { type: String, required: true },
    // Where the group is from, as a free-text region: doujin circles are not
    // tidily national and "Tokyo" is more use than a country code.
    origin: { type: String, trim: true, default: '', maxlength: 120 },
    foundedYear: {
      type: Number,
      min: [1900, 'foundedYear must be 1900 or later'],
      max: [new Date().getFullYear() + 1, 'foundedYear cannot be in the future'],
    },
    description: { type: String, trim: true, default: '', maxlength: 4000 },
    // A circle usually has several homes — an official site, a Bandcamp, a
    // socials account — so this is a list rather than one `website` field.
    links: { type: [linkSchema], default: [] },
    logo: { type: fileSchema, default: null },
  },
  { timestamps: true }
);

circleSchema.index({ key: 1 }, { unique: true });
circleSchema.index({ name: 'text', description: 'text' });

// The key is never set by hand: it is the name, normalised.
circleSchema.pre('validate', function (next) {
  if (this.isModified('name')) this.key = circleKey(this.name);
  next();
});

export default mongoose.model('Circle', circleSchema);
