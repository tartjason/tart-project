const mongoose = require('mongoose');
const { Schema } = mongoose;

const replySchema = new Schema({
  author: { type: Schema.Types.ObjectId, ref: 'Artist', required: true },
  text: { type: String, required: true, trim: true, maxlength: 1000 },
  likes: [{ type: Schema.Types.ObjectId, ref: 'Artist' }],
  createdAt: { type: Date, default: Date.now }
});

const studioCommentSchema = new Schema({
  studioPostId: { type: Schema.Types.ObjectId, ref: 'StudioPost', required: true, index: true },
  author: { type: Schema.Types.ObjectId, ref: 'Artist', required: true },
  text: { type: String, required: true, trim: true, maxlength: 1000 },
  likes: [{ type: Schema.Types.ObjectId, ref: 'Artist' }],
  replies: [replySchema],
  createdAt: { type: Date, default: Date.now, index: true }
});

module.exports = mongoose.models.StudioComment || mongoose.model('StudioComment', studioCommentSchema);
