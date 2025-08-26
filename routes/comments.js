const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const mongoose = require('mongoose');
const Comment = require('../models/comment');
const Artwork = require('../models/artwork');
const CommentNotification = require('../models/CommentNotification');

// Helper: normalize comment/reply payload for client
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
    artworkId: String(c.artworkId),
    author: toAuthorShape(c.author),
    text: c.text,
    likesCount: likes.length,
    likedByMe,
    repliesCount: replies.length,
    replies,
    createdAt: c.createdAt
  };
}

// POST /api/comments/:commentId/replies
router.post('/:commentId/replies', auth, async (req, res) => {
  try {
    const { commentId } = req.params;
    const text = String((req.body && req.body.text) || '').trim();
    if (!text) return res.status(400).json({ msg: 'Text is required' });
    if (!mongoose.isValidObjectId(commentId)) return res.status(404).json({ msg: 'Comment not found' });

    const parent = await Comment.findById(commentId).populate('author', 'name username profilePictureUrl');
    if (!parent) return res.status(404).json({ msg: 'Comment not found' });

    parent.replies.push({ author: req.artist.id, text });
    await parent.save();

    // last reply is the one we just added
    const savedParent = await Comment.findById(commentId).populate('replies.author', 'name username profilePictureUrl');
    const reply = savedParent.replies[savedParent.replies.length - 1];
    // Create notification to parent comment author (if not self)
    // Suppress this notification if the reply is actually a reply-to-reply.
    // The frontend prefixes such replies with: "Reply {Name}: ..."
    const isReplyToReply = /^reply\s+.+?:/i.test(text);
    try {
      const me = String(req.artist.id);
      const toArtist = parent.author && (parent.author._id || parent.author);
      if (toArtist && String(toArtist) !== me && !isReplyToReply) {
        await CommentNotification.create({
          toArtist: toArtist,
          fromArtist: me,
          type: 'reply',
          targetType: 'comment',
          commentId: parent._id,
          replyId: reply && reply._id ? reply._id : undefined,
        });
      }
    } catch (notifyErr) {
      console.warn('Reply notification error (non-fatal):', notifyErr && notifyErr.message ? notifyErr.message : notifyErr);
    }

    // If replying to a reply, notify that reply's author directly (if identifiable)
    try {
      if (isReplyToReply) {
        const me = String(req.artist.id);
        const m = text.match(/^reply\s+(.+?):/i);
        if (m && m[1]) {
          const label = String(m[1]).trim().toLowerCase();
          // Find the most recent reply whose author name or username matches the label
          const targetReply = [...savedParent.replies].reverse().find(r => {
            const a = r && r.author ? r.author : null;
            const nm = a && a.name ? String(a.name).trim().toLowerCase() : '';
            const un = a && a.username ? String(a.username).trim().toLowerCase() : '';
            return nm === label || un === label;
          });
          const toArtist = targetReply && targetReply.author && (targetReply.author._id || targetReply.author);
          if (toArtist && String(toArtist) !== me) {
            await CommentNotification.create({
              toArtist: toArtist,
              fromArtist: me,
              type: 'reply',
              targetType: 'reply',
              commentId: parent._id,
              replyId: reply && reply._id ? reply._id : undefined,
            });
          }
        }
      }
    } catch (notifyErr) {
      console.warn('Direct reply target notification error (non-fatal):', notifyErr && notifyErr.message ? notifyErr.message : notifyErr);
    }
    return res.status(201).json({ reply: toReplyShape(reply, req.artist.id) });
  } catch (e) {
    console.error('Error posting reply:', e);
    return res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/comments/:commentId/like  { like: boolean }
router.put('/:commentId/like', auth, async (req, res) => {
  try {
    const { commentId } = req.params;
    const like = !!(req.body && req.body.like);

    if (!mongoose.isValidObjectId(commentId)) return res.status(404).json({ msg: 'Not found' });

    // Try as a top-level comment first
    let doc = await Comment.findById(commentId);
    if (doc) {
      const arr = doc.likes;
      const me = req.artist.id;
      const has = arr.some(id => String(id) === String(me));
      if (like && !has) arr.push(me);
      if (!like && has) doc.likes = arr.filter(id => String(id) !== String(me));
      await doc.save();
      // Notify comment author on like (not self)
      try {
        if (like) {
          const toArtist = doc.author;
          if (toArtist && String(toArtist) !== String(me)) {
            await CommentNotification.create({
              toArtist: toArtist,
              fromArtist: me,
              type: 'like',
              targetType: 'comment',
              commentId: doc._id,
            });
          }
        }
      } catch (notifyErr) {
        console.warn('Comment like notification error (non-fatal):', notifyErr && notifyErr.message ? notifyErr.message : notifyErr);
      }
      return res.json({ likesCount: doc.likes.length, likedByMe: like });
    }

    // Try as a reply id
    const parent = await Comment.findOne({ 'replies._id': commentId });
    if (!parent) return res.status(404).json({ msg: 'Not found' });
    const reply = parent.replies.id(commentId);
    if (!reply) return res.status(404).json({ msg: 'Not found' });
    const arr = reply.likes || (reply.likes = []);
    const me = req.artist.id;
    const has = arr.some(id => String(id) === String(me));
    if (like && !has) arr.push(me);
    if (!like && has) reply.likes = arr.filter(id => String(id) !== String(me));
    await parent.save();
    // Notify reply author on like (not self)
    try {
      if (like) {
        const toArtist = reply.author;
        if (toArtist && String(toArtist) !== String(me)) {
          await CommentNotification.create({
            toArtist: toArtist,
            fromArtist: me,
            type: 'like',
            targetType: 'reply',
            commentId: parent._id,
            replyId: reply._id,
          });
        }
      }
    } catch (notifyErr) {
      console.warn('Reply like notification error (non-fatal):', notifyErr && notifyErr.message ? notifyErr.message : notifyErr);
    }
    return res.json({ likesCount: reply.likes.length, likedByMe: like });
  } catch (e) {
    console.error('Error toggling like:', e);
    return res.status(500).json({ msg: 'Server error' });
  }
});

// DELETE /api/comments/:commentId (comment or reply)
router.delete('/:commentId', auth, async (req, res) => {
  try {
    const { commentId } = req.params;
    if (!mongoose.isValidObjectId(commentId)) return res.status(404).json({ msg: 'Not found' });

    // Try comment
    let doc = await Comment.findById(commentId);
    if (doc) {
      // Only author or artwork author can delete
      const art = await Artwork.findById(doc.artworkId);
      const allowed = String(doc.author) === String(req.artist.id) || (art && String(art.artist) === String(req.artist.id));
      if (!allowed) return res.status(403).json({ msg: 'Forbidden' });
      await Comment.deleteOne({ _id: commentId });
      return res.status(204).send();
    }

    // Try reply
    const parent = await Comment.findOne({ 'replies._id': commentId });
    if (!parent) return res.status(404).json({ msg: 'Not found' });
    const reply = parent.replies.id(commentId);
    if (!reply) return res.status(404).json({ msg: 'Not found' });
    const art = await Artwork.findById(parent.artworkId);
    const allowed = String(reply.author) === String(req.artist.id) || (art && String(art.artist) === String(req.artist.id));
    if (!allowed) return res.status(403).json({ msg: 'Forbidden' });
    // Robust removal approach for cross-version Mongoose compatibility
    parent.replies = parent.replies.filter(r => String(r._id) !== String(commentId));
    await parent.save();
    return res.status(204).send();
  } catch (e) {
    console.error('Error deleting comment/reply:', e);
    return res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
