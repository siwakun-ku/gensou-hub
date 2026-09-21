import mongoose from 'mongoose';

export const RECOMMENDATION_MODES = ['fixed', 'random'];

const pickSchema = new mongoose.Schema(
  {
    album: { type: mongoose.Schema.Types.ObjectId, ref: 'Album', required: true },
    // The id of a track subdocument inside that album.
    track: { type: mongoose.Schema.Types.ObjectId, required: true },
  },
  { _id: false }
);

const recommendationSettingSchema = new mongoose.Schema(
  {
    // There is only ever one settings document; this key is what makes that true.
    key: { type: String, default: 'default', unique: true, immutable: true },
    mode: { type: String, enum: RECOMMENDATION_MODES, default: 'random' },
    limit: {
      type: Number,
      default: 6,
      min: [1, 'limit must be at least 1'],
      max: [24, 'limit cannot be more than 24'],
    },
    // Hand-picked tracks, in the order they should appear. Only used in
    // "fixed" mode, but kept when switching to random so the selection is not
    // lost by toggling.
    picks: { type: [pickSchema], default: [] },
  },
  { timestamps: true }
);

/** The settings document, created with defaults the first time it is asked for. */
recommendationSettingSchema.statics.load = async function load() {
  const existing = await this.findOne({ key: 'default' });
  if (existing) return existing;

  // upsert rather than create, so two simultaneous first requests cannot both
  // insert and trip the unique index.
  return this.findOneAndUpdate(
    { key: 'default' },
    { $setOnInsert: { key: 'default' } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
};

export default mongoose.model('RecommendationSetting', recommendationSettingSchema);
