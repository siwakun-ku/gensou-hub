import mongoose from 'mongoose';

/**
 * One listener marking one track.
 *
 * A row per mark rather than an array on the user: marking and unmarking is
 * then an insert and a delete on an indexed pair, with no read-modify-write of
 * a growing document, and two tabs toggling the same track cannot lose each
 * other's change.
 *
 * Like a playlist entry, this stores both ids because a track lives inside its
 * album, and neither is a guarantee — the album or the track may be deleted
 * later, which is resolved at read time rather than cascaded here.
 */
const favouriteSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    album: { type: mongoose.Schema.Types.ObjectId, ref: 'Album', required: true },
    track: { type: mongoose.Schema.Types.ObjectId, required: true },
  },
  { timestamps: true }
);

// A track is either a favourite or it is not; the index is what makes marking
// it twice a no-op rather than a second row.
favouriteSchema.index({ owner: 1, album: 1, track: 1 }, { unique: true });

// The list is always "this listener's, most recent first".
favouriteSchema.index({ owner: 1, createdAt: -1 });

export default mongoose.model('Favourite', favouriteSchema);
