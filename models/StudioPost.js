const mongoose = require('mongoose');
const { Schema } = mongoose;

const poemLineSchema = new Schema({
  html: { type: String, default: '' },
  color: { type: String, default: '' },
  indent: { type: Number, default: 0 },
  spacing: { type: Number, default: 0 },
}, { _id: false });

const poemSchema = new Schema({
  lines: [poemLineSchema]
}, { _id: false });

const studioPostSchema = new Schema({
  artist: { type: Schema.Types.ObjectId, ref: 'Artist', required: true, index: true },
  kind: { type: String, enum: ['poetry', 'media'], required: true },
  title: { type: String, trim: true, maxlength: 200 },
  description: { type: String, trim: true, maxlength: 1000 },
  status: { type: String, enum: ['in-progress', 'finished'], default: 'in-progress' },
  poem: poemSchema,
  media: {
    type: new Schema({
      type: { type: String },
      src: { type: String }, // URL to image/video
    }, { _id: false })
  },
  createdAt: { type: Date, default: Date.now, index: true }
});

module.exports = mongoose.models.StudioPost || mongoose.model('StudioPost', studioPostSchema);
