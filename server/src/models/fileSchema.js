import mongoose from 'mongoose';

/**
 * How an uploaded file is recorded. Shared by album covers, audio tracks and
 * hero wallpapers. `fileName` is the generated name the file was stored under
 * and is never exposed by the API.
 *
 * `url` is set only when the file lives in a blob store rather than on disk,
 * and is what tells the storage layer which of the two it is dealing with. A
 * document written by a disk deployment therefore stays readable as-is.
 */
const fileSchema = new mongoose.Schema(
  {
    fileName: { type: String, required: true },
    url: { type: String },
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true }, // bytes
  },
  { _id: false }
);

export default fileSchema;
