const mongoose = require('mongoose');
const { Schema } = mongoose;

const replySchema = new Schema({
  author: { type: Schema.Types.ObjectId, ref: 'Artist', required: true },
  text: { type: String, required: true, trim: true, maxlength: 1000 },
  likes: [{ type: Schema.Types.ObjectId, ref: 'Artist' }],
  createdAt: { type: Date, default: Date.now }
});

const commentSchema = new Schema({
  artworkId: { type: Schema.Types.ObjectId, ref: 'Artwork', required: true, index: true },
  author: { type: Schema.Types.ObjectId, ref: 'Artist', required: true },
  text: { type: String, required: true, trim: true, maxlength: 1000 },
  likes: [{ type: Schema.Types.ObjectId, ref: 'Artist' }],
  replies: [replySchema],
  createdAt: { type: Date, default: Date.now, index: true }
});

module.exports = mongoose.models.Comment || mongoose.model('Comment', commentSchema);
