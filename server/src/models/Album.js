import mongoose from 'mongoose';
import fileSchema from './fileSchema.js';

const AUDIO_MIME_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/flac', 'audio/ogg', 'audio/mp4', 'audio/aac'];
const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const trackSchema = new mongoose.Schema(
  {
    title: { type: String, required: [true, 'track title is required'], trim: true, maxlength: 200 },
    trackNumber: { type: Number, required: true, min: [1, 'trackNumber must be at least 1'] },
    // Everyone credited on this track — the performers, features and guests.
    // The album's own `circle` covers the release as a whole; this is what
    // varies track by track. Kept as a list because a joined-up string cannot
    // be searched or shown per name.
    contributingArtists: { type: [{ type: String, trim: true }], default: [] },
    duration: { type: Number, default: 0, min: 0 }, // seconds
    audio: { type: fileSchema, required: true },
  },
  { timestamps: true }
);

const albumSchema = new mongoose.Schema(
  {
    title: { type: String, required: [true, 'title is required'], trim: true, maxlength: 200 },
    // The group behind the release, not a performer: in doujin music the
    // circle is who put the record out, and its members vary track to track.
    circle: { type: String, required: [true, 'circle is required'], trim: true, maxlength: 200 },
    year: {
      type: Number,
      min: [1900, 'year must be 1900 or later'],
      max: [new Date().getFullYear() + 1, 'year cannot be in the future'],
    },
    genre: { type: String, trim: true, default: '' },
    description: { type: String, trim: true, default: '', maxlength: 2000 },
    cover: { type: fileSchema, default: null },
    tracks: { type: [trackSchema], default: [] },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

albumSchema.index({ title: 'text', circle: 'text', genre: 'text' });

albumSchema.virtual('trackCount').get(function () {
  return this.tracks?.length ?? 0;
});

albumSchema.virtual('totalDuration').get(function () {
  return (this.tracks ?? []).reduce((sum, track) => sum + (track.duration || 0), 0);
});

// Keep tracks in playing order regardless of the order they were uploaded in.
albumSchema.pre('save', function (next) {
  if (this.isModified('tracks')) {
    this.tracks.sort((a, b) => a.trackNumber - b.trackNumber);
  }
  next();
});

export { AUDIO_MIME_TYPES, IMAGE_MIME_TYPES };
export default mongoose.model('Album', albumSchema);
