import mongoose from 'mongoose';
import fileSchema from './fileSchema.js';

const wallpaperSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, default: '', maxlength: 120 },
    subtitle: { type: String, trim: true, default: '', maxlength: 240 },
    // Optional call to action shown over the slide.
    linkUrl: { type: String, trim: true, default: '', maxlength: 500 },
    linkLabel: { type: String, trim: true, default: '', maxlength: 60 },
    image: { type: fileSchema, required: [true, 'an image is required'] },
    // Lower numbers show first. New slides go to the end.
    order: { type: Number, default: 0 },
    // Lets an admin retire a slide without deleting the image.
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// The hero reads active slides in display order on every page load.
wallpaperSchema.index({ isActive: 1, order: 1 });

export default mongoose.model('Wallpaper', wallpaperSchema);
