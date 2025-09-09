const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const mongoose = require('mongoose');
const StudioPost = require('../models/StudioPost');

function toArtistShape(artist) {
  if (!artist) return undefined;
  const a = (typeof artist.toObject === 'function') ? artist.toObject() : artist;
  return { _id: String(a._id), name: a.name, username: a.username, profilePictureUrl: a.profilePictureUrl };
}

function toPostShape(doc) {
  const p = (typeof doc.toObject === 'function') ? doc.toObject({ virtuals: false }) : doc;
  return {
    _id: String(p._id),
    artist: toArtistShape(p.artist),
    kind: p.kind,
    title: p.title || '',
    description: p.description || '',
    status: p.status || 'in-progress',
    poem: p.poem || null,
    media: p.media || null,
    createdAt: p.createdAt,
  };
}

// GET /api/studio-posts?artistId=<optional>&limit=20&cursor=<createdAt>
router.get('/', async (req, res) => {
  try {
    const { artistId, limit, cursor } = req.query;
    const q = {};
    if (artistId && mongoose.isValidObjectId(artistId)) q.artist = artistId;
    const lim = Math.min(50, Math.max(1, parseInt(limit || '20', 10)));
    if (cursor) q.createdAt = { $lt: new Date(cursor) };
    const posts = await StudioPost.find(q)
      .populate('artist', 'name username profilePictureUrl')
      .sort({ createdAt: -1 })
      .limit(lim + 1);
    const items = posts.slice(0, lim).map(toPostShape);
    const nextCursor = posts.length > lim ? posts[lim].createdAt : null;
    return res.json({ items, nextCursor });
  } catch (e) {
    console.error('List studio posts error:', e);
    return res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/studio-posts
router.post('/', auth, async (req, res) => {
  try {
    const body = req.body || {};
    const kind = String(body.kind || '').toLowerCase();
    if (!['poetry', 'media'].includes(kind)) return res.status(400).json({ msg: 'Invalid kind' });
    const doc = new StudioPost({
      artist: req.artist.id,
      kind,
      title: (body.title || '').slice(0, 200),
      description: (body.description || '').slice(0, 1000),
      status: ['in-progress', 'finished'].includes(body.status) ? body.status : 'in-progress',
      poem: kind === 'poetry' ? (body.poem || { lines: [] }) : undefined,
      media: kind === 'media' ? (body.media || {}) : undefined,
    });
    await doc.save();
    const saved = await StudioPost.findById(doc._id).populate('artist', 'name username profilePictureUrl');
    return res.status(201).json(toPostShape(saved));
  } catch (e) {
    console.error('Create studio post error:', e);
    return res.status(500).json({ msg: 'Server error' });
  }
});

// DELETE /api/studio-posts/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(404).json({ msg: 'Not found' });
    const post = await StudioPost.findById(id);
    if (!post) return res.status(404).json({ msg: 'Not found' });
    if (String(post.artist) !== String(req.artist.id)) return res.status(403).json({ msg: 'Forbidden' });
    await StudioPost.deleteOne({ _id: id });
    return res.status(204).send();
  } catch (e) {
    console.error('Delete studio post error:', e);
    return res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
