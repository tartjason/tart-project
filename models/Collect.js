const mongoose = require('mongoose');

const CollectSchema = new mongoose.Schema({
  collector: { type: mongoose.Schema.Types.ObjectId, ref: 'Artist', required: true }, // who collected
  artwork: { type: mongoose.Schema.Types.ObjectId, ref: 'Artwork', required: true }, // which artwork
  toArtist: { type: mongoose.Schema.Types.ObjectId, ref: 'Artist', required: true }, // owner of the artwork (notification target)
}, { timestamps: true });

// Prevent duplicate collect records per (collector, artwork)
CollectSchema.index({ collector: 1, artwork: 1 }, { unique: true });
// Efficient querying for a user's collection notifications
CollectSchema.index({ toArtist: 1, createdAt: -1 });

module.exports = mongoose.models.Collect || mongoose.model('Collect', CollectSchema);
