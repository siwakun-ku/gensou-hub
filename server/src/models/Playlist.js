import mongoose from 'mongoose';

/**
 * One entry in a playlist. A track lives inside its album document, so an entry
 * needs both ids to find it again — and neither is a guarantee: the album or
 * the track may be deleted later, which is resolved at read time rather than
 * cascaded here.
 */
const playlistItemSchema = new mongoose.Schema(
  {
    album: { type: mongoose.Schema.Types.ObjectId, ref: 'Album', required: true },
    track: { type: mongoose.Schema.Types.ObjectId, required: true },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const playlistSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: {
      type: String,
      required: [true, 'name is required'],
      trim: true,
      maxlength: [120, 'name cannot exceed 120 characters'],
    },
    description: { type: String, trim: true, default: '', maxlength: 500 },
    items: { type: [playlistItemSchema], default: [] },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Every query is "this user's playlists", and a person cannot have two by the
// same name — an ambiguous "Add to…" menu is worse than a rejected rename.
playlistSchema.index({ owner: 1, name: 1 }, { unique: true });

playlistSchema.virtual('trackCount').get(function () {
  return this.items?.length ?? 0;
});

/** Whether this track is already on the playlist, by album + track pair. */
playlistSchema.methods.hasTrack = function (albumId, trackId) {
  return this.items.some(
    (item) => item.album.toString() === String(albumId) && item.track.toString() === String(trackId)
  );
};

export default mongoose.model('Playlist', playlistSchema);
