const mongoose = require('mongoose');

const CommentNotificationSchema = new mongoose.Schema({
  toArtist: { type: mongoose.Schema.Types.ObjectId, ref: 'Artist', required: true, index: true },
  fromArtist: { type: mongoose.Schema.Types.ObjectId, ref: 'Artist', required: true },
  type: { type: String, enum: ['reply', 'like', 'comment'], required: true },
  targetType: { type: String, enum: ['comment', 'reply'], required: true },
  // Always store the top-level comment id to allow easy linking
  commentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment', required: true },
  // For reply-related events (reply posted, reply liked), store the subdocument _id
  replyId: { type: mongoose.Schema.Types.ObjectId },
}, { timestamps: true });

// Useful indexes for querying a user's notifications
CommentNotificationSchema.index({ toArtist: 1, createdAt: -1 });
CommentNotificationSchema.index({ toArtist: 1, type: 1, createdAt: -1 });

module.exports = mongoose.models.CommentNotification || mongoose.model('CommentNotification', CommentNotificationSchema);
