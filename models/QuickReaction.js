const mongoose = require('mongoose');

const QuickReactionSchema = new mongoose.Schema({
  postId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudioPost', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'Artist', required: true, index: true },
  emoji: { type: String, required: true, maxlength: 8 },
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

QuickReactionSchema.index({ postId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('QuickReaction', QuickReactionSchema);
