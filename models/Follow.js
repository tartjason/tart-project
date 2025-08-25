const mongoose = require('mongoose');

const FollowSchema = new mongoose.Schema({
  follower: { type: mongoose.Schema.Types.ObjectId, ref: 'Artist', required: true }, // who follows
  following: { type: mongoose.Schema.Types.ObjectId, ref: 'Artist', required: true }, // who is being followed
}, { timestamps: true });

// Prevent duplicates
FollowSchema.index({ follower: 1, following: 1 }, { unique: true });
// Helpful secondary index for querying a user's followers
FollowSchema.index({ following: 1, createdAt: -1 });

module.exports = mongoose.models.Follow || mongoose.model('Follow', FollowSchema);
