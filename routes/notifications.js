const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Follow = require('../models/Follow');
const Collect = require('../models/Collect');

// GET /api/notifications/followers
// Returns recent followers (who followed the current user), newest first
router.get('/followers', auth, async (req, res) => {
  try {
    const userId = req.artist.id;
    let limit = parseInt(req.query.limit, 10);
    if (isNaN(limit)) limit = 20;
    limit = Math.max(1, Math.min(100, limit));

    const docs = await Follow.find({ following: userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('follower', 'name profilePictureUrl');

    const out = docs.map(d => ({
      follower: d.follower ? {
        _id: d.follower._id,
        name: d.follower.name,
        profilePictureUrl: d.follower.profilePictureUrl,
      } : null,
      createdAt: d.createdAt,
    }));

    res.json(out);
  } catch (e) {
    console.error('Notifications fetch error:', e);
    res.status(500).json({ msg: 'Failed to fetch notifications' });
  }
});

// GET /api/notifications/collections
// Returns recent collection events (someone collected your artwork), newest first
router.get('/collections', auth, async (req, res) => {
  try {
    const userId = req.artist.id;
    let limit = parseInt(req.query.limit, 10);
    if (isNaN(limit)) limit = 20;
    limit = Math.max(1, Math.min(100, limit));

    const docs = await Collect.find({ toArtist: userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('collector', 'name profilePictureUrl')
      .populate('artwork', 'title');

    const out = docs.map(d => ({
      collector: d.collector ? {
        _id: d.collector._id,
        name: d.collector.name,
        profilePictureUrl: d.collector.profilePictureUrl,
      } : null,
      artwork: d.artwork ? {
        _id: d.artwork._id,
        title: d.artwork.title,
      } : null,
      createdAt: d.createdAt,
    }));

    res.json(out);
  } catch (e) {
    console.error('Collections notifications fetch error:', e);
    res.status(500).json({ msg: 'Failed to fetch collection notifications' });
  }
});

module.exports = router;
