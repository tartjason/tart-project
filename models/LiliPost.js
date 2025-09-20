const mongoose = require('mongoose');

const LiliPostSchema = new mongoose.Schema({
  artist: { type: mongoose.Schema.Types.ObjectId, ref: 'Artist', required: true },
  type: { type: String, enum: ['text', 'media'], required: true },
  title: { type: String, trim: true, default: '' },
  text: { type: String, trim: true, default: '' }, // for text posts
  // Backward-compatible single image URL (first image when multiple provided)
  imageUrl: { type: String, trim: true, default: '' }, // for media posts
  // New: support multiple images per media post (max 4 enforced in routes)
  images: { type: [String], default: [] },
  description: { type: String, trim: true, default: '' }, // for media posts
  likesCount: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('LiliPost', LiliPostSchema);
