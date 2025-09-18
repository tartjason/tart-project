const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const LiliPost = require('../models/LiliPost');
const Artist = require('../models/artist');

// Helper to project API response
function toDto(doc, artist) {
  return {
    id: doc._id.toString(),
    type: doc.type,
    title: doc.title || '',
    text: doc.text || '',
    imageUrl: doc.imageUrl || '',
    description: doc.description || '',
    createdAt: doc.createdAt,
    likesCount: typeof doc.likesCount === 'number' ? doc.likesCount : 0,
    author: {
      id: artist ? artist._id.toString() : (doc.artist && doc.artist.toString ? doc.artist.toString() : ''),
      name: artist ? artist.name : 'Artist',
      profilePictureUrl: artist && artist.profilePictureUrl ? artist.profilePictureUrl : '/assets/default-avatar.svg'
    }
  };
}

// GET /api/lili-posts  (public)
// Query: limit (default 10, max 30), cursor (opaque string: createdAt|id)
router.get('/', async (req, res) => {
  try {
    let limit = Math.min(parseInt(req.query.limit || '10', 10) || 10, 30);
    const cursor = req.query.cursor || '';

    const query = {};
    if (cursor) {
      // cursor format: tsMillis_id
      const [tsStr, idStr] = String(cursor).split('_');
      const ts = new Date(parseInt(tsStr, 10));
      const id = mongoose.Types.ObjectId.isValid(idStr) ? new mongoose.Types.ObjectId(idStr) : null;
      if (!isNaN(ts.getTime()) && id) {
        query.$or = [
          { createdAt: { $lt: ts } },
          { createdAt: ts, _id: { $lt: id } }
        ];
      }
    }

    const docs = await LiliPost.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .lean();

    // Fetch artists for the posts
    const artistIds = [...new Set(docs.map(d => String(d.artist)))];
    const artists = await Artist.find({ _id: { $in: artistIds } }, { name: 1, profilePictureUrl: 1 }).lean();
    const artistMap = new Map(artists.map(a => [String(a._id), a]));

    const items = docs.map(d => toDto(d, artistMap.get(String(d.artist))));
    let nextCursor = null;
    if (docs.length === limit) {
      const last = docs[docs.length - 1];
      nextCursor = `${new Date(last.createdAt).getTime()}_${last._id.toString()}`;
    }
    return res.json({ items, nextCursor });
  } catch (err) {
    console.error('LiliPosts GET error:', err);
    return res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/lili-posts/:id/like  (public)
// Increments likesCount atomically; no auth required. Idempotency is enforced client-side per device.
router.post('/:id/like', async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ msg: 'Invalid id' });
    }
    const updated = await LiliPost.findOneAndUpdate(
      { _id: id },
      { $inc: { likesCount: 1 } },
      { new: true }
    ).lean();
    if (!updated) return res.status(404).json({ msg: 'Not found' });
    // Return the new count
    return res.json({ likesCount: updated.likesCount || 0 });
  } catch (err) {
    console.error('LiliPosts LIKE error:', err);
    return res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/lili-posts  (private)
// Body: { type: 'text'|'media', title, text?, imageUrl?, description? }
router.post('/', auth, async (req, res) => {
  try {
    const { type, title, text, imageUrl, description } = req.body || {};
    if (!type || !['text','media'].includes(type)) return res.status(400).json({ msg: 'Invalid type' });

    const payload = {
      artist: req.artist.id,
      type,
      title: String(title || '').slice(0, 200),
    };
    if (type === 'text') {
      payload.text = String(text || '').slice(0, 5000);
    } else {
      payload.imageUrl = String(imageUrl || '').trim();
      payload.description = String(description || '').slice(0, 5000);
      if (!payload.imageUrl) return res.status(400).json({ msg: 'imageUrl required for media post' });
    }

    const doc = await LiliPost.create(payload);
    const artist = await Artist.findById(req.artist.id).lean();
    return res.status(201).json({ item: toDto(doc, artist) });
  } catch (err) {
    console.error('LiliPosts POST error:', err);
    return res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
 
// PUT /api/lili-posts/:id  (private, owner only)
// Body: partial update depending on type; server enforces by stored doc.type
router.put('/:id', auth, async (req, res) => {
  try {
    const id = req.params.id;
    const doc = await LiliPost.findById(id);
    if (!doc) return res.status(404).json({ msg: 'Not found' });
    if (String(doc.artist) !== String(req.artist.id)) return res.status(403).json({ msg: 'Forbidden' });

    // Only certain fields are updatable
    doc.title = String(req.body.title ?? doc.title).slice(0, 200);
    if (doc.type === 'text') {
      doc.text = String(req.body.text ?? doc.text).slice(0, 5000);
    } else if (doc.type === 'media') {
      if (typeof req.body.imageUrl === 'string' && req.body.imageUrl.trim()) {
        doc.imageUrl = req.body.imageUrl.trim();
      }
      doc.description = String(req.body.description ?? doc.description).slice(0, 5000);
    }
    await doc.save();
    const artist = await Artist.findById(doc.artist).lean();
    return res.json({ item: toDto(doc.toObject(), artist) });
  } catch (err) {
    console.error('LiliPosts PUT error:', err);
    return res.status(500).json({ msg: 'Server error' });
  }
});

// DELETE /api/lili-posts/:id  (private, owner only)
router.delete('/:id', auth, async (req, res) => {
  try {
    const id = req.params.id;
    const doc = await LiliPost.findById(id);
    if (!doc) return res.status(404).json({ msg: 'Not found' });
    if (String(doc.artist) !== String(req.artist.id)) return res.status(403).json({ msg: 'Forbidden' });
    await doc.deleteOne();
    return res.json({ ok: true });
  } catch (err) {
    console.error('LiliPosts DELETE error:', err);
    return res.status(500).json({ msg: 'Server error' });
  }
});
