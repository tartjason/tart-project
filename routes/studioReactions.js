const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const QuickReaction = require('../models/QuickReaction');
const StudioPost = require('../models/StudioPost');

// Shape server doc to client reaction
function toReactionShape(doc) {
  const d = (typeof doc.toObject === 'function') ? doc.toObject() : doc;
  const user = d.userId || d.user || d.userRef;
  const userId = user && (user._id || user.id) ? String(user._id || user.id) : String(d.userId);
  const avatarUrl = (user && user.profilePictureUrl) || '/assets/default-avatar.svg';
  return { userId, avatarUrl, emoji: d.emoji };
}

// GET /api/studio/posts/:postId/reactions
router.get('/posts/:postId/reactions', async (req, res) => {
  try {
    const { postId } = req.params;
    if (!mongoose.isValidObjectId(postId)) return res.status(404).json({ msg: 'Not found' });
    const docs = await QuickReaction.find({ postId })
      .populate('userId', 'profilePictureUrl')
      // Deterministic ordering for consistent avatar stacks across devices
      .sort({ userId: 1 })
      .limit(60);
    return res.json({ reactions: docs.map(toReactionShape) });
  } catch (e) {
    console.error('List quick reactions error:', e);
    return res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/studio/posts/:postId/reactions { emoji }
router.put('/posts/:postId/reactions', auth, async (req, res) => {
  try {
    const { postId } = req.params;
    const emoji = String((req.body && req.body.emoji) || '').trim();
    if (!mongoose.isValidObjectId(postId)) return res.status(404).json({ msg: 'Not found' });
    if (!emoji) return res.status(400).json({ msg: 'Emoji is required' });

    const post = await StudioPost.findById(postId).lean();
    if (!post) return res.status(404).json({ msg: 'Not found' });

    const doc = await QuickReaction.findOneAndUpdate(
      { postId, userId: req.artist.id },
      { $set: { emoji } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).populate('userId', 'profilePictureUrl');

    return res.json({ reaction: toReactionShape(doc) });
  } catch (e) {
    console.error('Upsert quick reaction error:', e);
    return res.status(500).json({ msg: 'Server error' });
  }
});

// DELETE /api/studio/posts/:postId/reactions (clear my reaction)
router.delete('/posts/:postId/reactions', auth, async (req, res) => {
  try {
    const { postId } = req.params;
    if (!mongoose.isValidObjectId(postId)) return res.status(404).json({ msg: 'Not found' });
    await QuickReaction.deleteOne({ postId, userId: req.artist.id });
    return res.status(204).send();
  } catch (e) {
    console.error('Delete quick reaction error:', e);
    return res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
