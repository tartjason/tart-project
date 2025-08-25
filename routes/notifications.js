const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Follow = require('../models/Follow');

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

module.exports = router;
