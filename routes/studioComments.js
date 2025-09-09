const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const mongoose = require('mongoose');
const StudioPost = require('../models/StudioPost');
const StudioComment = require('../models/StudioComment');

function toAuthorShape(artistDoc) {
  if (!artistDoc) return undefined;
  const a = (typeof artistDoc.toObject === 'function') ? artistDoc.toObject() : artistDoc;
  return { _id: String(a._id), username: a.username, name: a.name, profilePictureUrl: a.profilePictureUrl };
}
function toReplyShape(reply, currentUserId) {
  const r = (typeof reply.toObject === 'function') ? reply.toObject() : reply;
  const likes = Array.isArray(r.likes) ? r.likes : [];
  const likedByMe = currentUserId ? likes.some(id => String(id) === String(currentUserId)) : false;
  return {
    _id: String(r._id),
    author: toAuthorShape(r.author),
    text: r.text,
    likesCount: likes.length,
    likedByMe,
    createdAt: r.createdAt
  };
}
function toCommentShape(doc, currentUserId) {
  const c = (typeof doc.toObject === 'function') ? doc.toObject() : doc;
  const likes = Array.isArray(c.likes) ? c.likes : [];
  const likedByMe = currentUserId ? likes.some(id => String(id) === String(currentUserId)) : false;
  const replies = Array.isArray(c.replies) ? c.replies.map(r => toReplyShape(r, currentUserId)) : [];
  return {
    _id: String(c._id),
    studioPostId: String(c.studioPostId),
    author: toAuthorShape(c.author),
    text: c.text,
    likesCount: likes.length,
    likedByMe,
    repliesCount: replies.length,
    replies,
    createdAt: c.createdAt
  };
}

// GET /api/studio-posts/:postId/comments
router.get('/posts/:postId/comments', async (req, res) => {
  try {
    const { postId } = req.params;
    if (!mongoose.isValidObjectId(postId)) return res.status(404).json({ msg: 'Not found' });
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '10', 10)));
    const cursor = req.query.cursor ? new Date(req.query.cursor) : null;
    const q = { studioPostId: postId };
    if (cursor) q.createdAt = { $lt: cursor };
    const docs = await StudioComment.find(q)
      .populate('author', 'name username profilePictureUrl')
      .populate('replies.author', 'name username profilePictureUrl')
      .sort({ createdAt: -1 })
      .limit(limit + 1);
    const items = docs.slice(0, limit).map(d => toCommentShape(d, req.artist && req.artist.id));
    const nextCursor = docs.length > limit ? docs[limit].createdAt : null;
    return res.json({ comments: items, nextCursor });
  } catch (e) {
    console.error('List studio comments error:', e);
    return res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/studio-posts/:postId/comments
router.post('/posts/:postId/comments', auth, async (req, res) => {
  try {
    const { postId } = req.params;
    if (!mongoose.isValidObjectId(postId)) return res.status(404).json({ msg: 'Not found' });
    const post = await StudioPost.findById(postId);
    if (!post) return res.status(404).json({ msg: 'Not found' });
    const text = String((req.body && req.body.text) || '').trim();
    if (!text) return res.status(400).json({ msg: 'Text is required' });
    const c = await StudioComment.create({ studioPostId: postId, author: req.artist.id, text });
    const saved = await StudioComment.findById(c._id).populate('author', 'name username profilePictureUrl');
    return res.status(201).json({ comment: toCommentShape(saved, req.artist.id) });
  } catch (e) {
    console.error('Create studio comment error:', e);
    return res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/studio-comments/:commentId/replies
router.post('/comments/:commentId/replies', auth, async (req, res) => {
  try {
    const { commentId } = req.params;
    const text = String((req.body && req.body.text) || '').trim();
    if (!text) return res.status(400).json({ msg: 'Text is required' });
    if (!mongoose.isValidObjectId(commentId)) return res.status(404).json({ msg: 'Comment not found' });

    const parent = await StudioComment.findById(commentId).populate('author', 'name username profilePictureUrl');
    if (!parent) return res.status(404).json({ msg: 'Comment not found' });

    parent.replies.push({ author: req.artist.id, text });
    await parent.save();

    const savedParent = await StudioComment.findById(commentId).populate('replies.author', 'name username profilePictureUrl');
    const reply = savedParent.replies[savedParent.replies.length - 1];

    return res.status(201).json({ reply: toReplyShape(reply, req.artist.id) });
  } catch (e) {
    console.error('Post studio reply error:', e);
    return res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/studio-comments/:commentId/like { like: boolean }
router.put('/comments/:commentId/like', auth, async (req, res) => {
  try {
    const { commentId } = req.params;
    const like = !!(req.body && req.body.like);
    if (!mongoose.isValidObjectId(commentId)) return res.status(404).json({ msg: 'Not found' });

    let doc = await StudioComment.findById(commentId);
    if (doc) {
      const arr = doc.likes;
      const me = req.artist.id;
      const has = arr.some(id => String(id) === String(me));
      if (like && !has) arr.push(me);
      if (!like && has) doc.likes = arr.filter(id => String(id) !== String(me));
      await doc.save();
      return res.json({ likesCount: doc.likes.length, likedByMe: like });
    }

    const parent = await StudioComment.findOne({ 'replies._id': commentId });
    if (!parent) return res.status(404).json({ msg: 'Not found' });
    const reply = parent.replies.id(commentId);
    if (!reply) return res.status(404).json({ msg: 'Not found' });
    const arr = reply.likes || (reply.likes = []);
    const me = req.artist.id;
    const has = arr.some(id => String(id) === String(me));
    if (like && !has) arr.push(me);
    if (!like && has) reply.likes = arr.filter(id => String(id) !== String(me));
    await parent.save();
    return res.json({ likesCount: reply.likes.length, likedByMe: like });
  } catch (e) {
    console.error('Like studio comment/reply error:', e);
    return res.status(500).json({ msg: 'Server error' });
  }
});

// DELETE /api/studio-comments/:commentId (comment or reply)
router.delete('/comments/:commentId', auth, async (req, res) => {
  try {
    const { commentId } = req.params;
    if (!mongoose.isValidObjectId(commentId)) return res.status(404).json({ msg: 'Not found' });

    // Try comment
    let doc = await StudioComment.findById(commentId);
    if (doc) {
      // Only author or post author can delete
      const post = await StudioPost.findById(doc.studioPostId);
      const allowed = String(doc.author) === String(req.artist.id) || (post && String(post.artist) === String(req.artist.id));
      if (!allowed) return res.status(403).json({ msg: 'Forbidden' });
      await StudioComment.deleteOne({ _id: commentId });
      return res.status(204).send();
    }

    // Try reply
    const parent = await StudioComment.findOne({ 'replies._id': commentId });
    if (!parent) return res.status(404).json({ msg: 'Not found' });
    const reply = parent.replies.id(commentId);
    if (!reply) return res.status(404).json({ msg: 'Not found' });
    const post = await StudioPost.findById(parent.studioPostId);
    const allowed = String(reply.author) === String(req.artist.id) || (post && String(post.artist) === String(req.artist.id));
    if (!allowed) return res.status(403).json({ msg: 'Forbidden' });
    parent.replies = parent.replies.filter(r => String(r._id) !== String(commentId));
    await parent.save();
    return res.status(204).send();
  } catch (e) {
    console.error('Delete studio comment/reply error:', e);
    return res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
