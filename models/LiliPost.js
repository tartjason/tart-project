const mongoose = require('mongoose');

const LiliPostSchema = new mongoose.Schema({
  artist: { type: mongoose.Schema.Types.ObjectId, ref: 'Artist', required: true },
  type: { type: String, enum: ['text', 'media'], required: true },
  title: { type: String, trim: true, default: '' },
  text: { type: String, trim: true, default: '' }, // for text posts
  imageUrl: { type: String, trim: true, default: '' }, // for media posts
  description: { type: String, trim: true, default: '' }, // for media posts
}, { timestamps: true });

module.exports = mongoose.model('LiliPost', LiliPostSchema);
