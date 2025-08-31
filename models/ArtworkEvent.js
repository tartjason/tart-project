const mongoose = require('mongoose');

const ArtworkEventSchema = new mongoose.Schema({
  artworkId: { type: mongoose.Schema.Types.ObjectId, ref: 'Artwork', required: true, index: true },
  artistId: { type: mongoose.Schema.Types.ObjectId, ref: 'Artist' },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'Artist' },
  type: { type: String, enum: ['view_start', 'view_end', 'unblur'], required: true, index: true },
  dwellMs: { type: Number, default: 0 },
  ua: { type: String },
  ip: { type: String },
  sessionId: { type: String },
  ts: { type: Date, default: Date.now, index: true }
}, { timestamps: true });

module.exports = mongoose.model('ArtworkEvent', ArtworkEventSchema);
