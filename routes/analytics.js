const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const ArtworkEvent = require('../models/ArtworkEvent');
const Artwork = require('../models/artwork');

// POST /api/analytics/artwork-event
// Body: { artworkId, type: 'view_start'|'view_end'|'unblur', dwellMs?, sessionId? }
// Auth optional: if token provided, we record userId
router.post('/artwork-event', async (req, res) => {
  try {
    const { artworkId, type } = req.body || {};
    if (!artworkId || !mongoose.Types.ObjectId.isValid(String(artworkId))) {
      return res.status(400).json({ msg: 'artworkId required' });
    }
    const allowed = new Set(['view_start', 'view_end', 'unblur']);
    if (!allowed.has(String(type))) {
      return res.status(400).json({ msg: 'invalid type' });
    }
    const dwellMs = Number.isFinite(req.body?.dwellMs) ? Math.max(0, Math.min(3600_000, Math.floor(req.body.dwellMs))) : 0;
    const sessionId = typeof req.body?.sessionId === 'string' && req.body.sessionId.length <= 64 ? req.body.sessionId : undefined;

    // Optional auth: try to decode x-auth-token if provided
    let userId = undefined;
    try {
      const token = req.header('x-auth-token');
      if (token) {
        const JWT_SECRET = process.env.JWT_SECRET || 'dev-insecure-secret';
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded && typeof decoded === 'object') {
          // Support both { artist: {...} } and { _id }
          userId = decoded.artist?._id || decoded.artist || decoded._id || undefined;
        }
      }
    } catch (_) { /* ignore token errors */ }

    let artistId = undefined;
    try {
      const aw = await Artwork.findById(artworkId).select('artist').lean();
      if (aw && aw.artist) artistId = aw.artist._id || aw.artist;
    } catch (_) { /* ignore lookup errors */ }

    const ua = req.get('user-agent');
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress;

    const doc = await ArtworkEvent.create({
      artworkId,
      artistId,
      userId,
      type,
      dwellMs,
      ua,
      ip,
      sessionId,
      ts: new Date()
    });

    return res.json({ ok: true, id: String(doc._id) });
  } catch (err) {
    console.error('artwork-event error', err);
    return res.status(500).json({ msg: 'server error' });
  }
});

module.exports = router;
