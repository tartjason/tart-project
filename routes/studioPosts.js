const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const mongoose = require('mongoose');
const StudioPost = require('../models/StudioPost');
// Lazy-require sharp for image processing when needed
let sharp = null;

function isHttpUrl(str) {
  return typeof str === 'string' && /^https?:\/\//i.test(str);
}

function isDataUrl(str) {
  return typeof str === 'string' && /^data:/i.test(str);
}

function parseDataUrl(dataUrl) {
  // Returns { mime, buffer } or null
  try {
    if (!isDataUrl(dataUrl)) return null;
    const commaIdx = dataUrl.indexOf(',');
    if (commaIdx === -1) return null;
    const meta = dataUrl.slice(5, commaIdx); // after 'data:'
    const base64 = /;base64/i.test(meta);
    const mime = meta.split(';')[0] || 'application/octet-stream';
    const data = dataUrl.slice(commaIdx + 1);
    const buf = base64 ? Buffer.from(data, 'base64') : Buffer.from(decodeURIComponent(data), 'utf8');
    return { mime, buffer: buf };
  } catch (_) {
    return null;
  }
}

function toArtistShape(artist) {
  if (!artist) return undefined;
  const a = (typeof artist.toObject === 'function') ? artist.toObject() : artist;
  return { _id: String(a._id), name: a.name, username: a.username, profilePictureUrl: a.profilePictureUrl };
}

function toPostShape(doc) {
  const p = (typeof doc.toObject === 'function') ? doc.toObject({ virtuals: false }) : doc;
  const out = {
    _id: String(p._id),
    artist: toArtistShape(p.artist),
    kind: p.kind,
    title: p.title || '',
    description: p.description || '',
    status: p.status || 'in-progress',
    poem: p.poem || null,
    media: null,
    createdAt: p.createdAt,
  };
  // Reduce payload size for media posts by avoiding large inline data URLs.
  if (p.kind === 'media' && p.media) {
    const src = p.media.src || '';
    const type = p.media.type || '';
    // Build a lightweight media object with thumbnail and full URLs
    const media = { type };
    if (isHttpUrl(src)) {
      // Remote image/video (e.g., S3) — include src and a proxy thumb for images
      media.src = src;
      if (type && type.startsWith('image/')) {
        const u = new URLSearchParams({ url: src, w: '640', q: '75' });
        media.thumbUrl = `/api/image/thumbnail?${u.toString()}`;
        media.fullUrl = src;
      } else {
        media.fullUrl = src;
      }
    } else if (isDataUrl(src)) {
      // Data URLs: expose server endpoint to stream/resize
      const id = String(p._id);
      media.thumbUrl = `/api/studio-posts/${encodeURIComponent(id)}/media?w=640&q=75`;
      media.fullUrl = `/api/studio-posts/${encodeURIComponent(id)}/media`;
      // Back-compat for clients expecting media.src
      media.src = media.fullUrl;
    }
    out.media = media;
  }
  return out;
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

// GET /api/studio-posts/:id/media
// Streams the media for a studio post. Supports optional resizing for images via sharp.
router.get('/:id/media', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(404).json({ msg: 'Not found' });
    const post = await StudioPost.findById(id);
    if (!post || post.kind !== 'media' || !post.media || !post.media.src) {
      return res.status(404).json({ msg: 'Not found' });
    }
    const src = post.media.src;
    const type = post.media.type || '';

    const w = req.query.w ? Math.max(1, Math.min(2000, parseInt(req.query.w, 10) || 0)) : null;
    const h = req.query.h ? Math.max(1, Math.min(2000, parseInt(req.query.h, 10) || 0)) : null;
    const q = req.query.q ? Math.max(40, Math.min(92, parseInt(req.query.q, 10) || 75)) : 75;

    // For non-image types or when no resize requested, prefer streaming original
    const wantsResize = !!(w || h);

    // Data URL case
    if (isDataUrl(src)) {
      const parsed = parseDataUrl(src);
      if (!parsed) return res.status(400).json({ msg: 'Invalid media' });
      // Resize only for images
      if (wantsResize && (type && type.startsWith('image/'))) {
        if (!sharp) sharp = require('sharp');
        const out = await sharp(parsed.buffer).rotate().resize({ width: w || null, height: h || null, fit: 'inside', withoutEnlargement: true }).webp({ quality: q }).toBuffer();
        res.set('Content-Type', 'image/webp');
        res.set('Cache-Control', 'public, max-age=86400');
        return res.send(out);
      }
      // Stream original
      res.set('Content-Type', parsed.mime || (type || 'application/octet-stream'));
      res.set('Cache-Control', 'public, max-age=3600');
      return res.send(parsed.buffer);
    }

    // Remote URL case
    if (isHttpUrl(src)) {
      // If an image and resizing requested, proxy via sharp
      if (wantsResize && (type && type.startsWith('image/'))) {
        if (!sharp) sharp = require('sharp');
        const resp = await fetch(src, { cache: 'no-store' });
        if (!resp.ok) return res.status(502).json({ msg: 'Failed to fetch media' });
        const buf = Buffer.from(await resp.arrayBuffer());
        const out = await sharp(buf).rotate().resize({ width: w || null, height: h || null, fit: 'inside', withoutEnlargement: true }).webp({ quality: q }).toBuffer();
        res.set('Content-Type', 'image/webp');
        res.set('Cache-Control', 'public, max-age=86400');
        return res.send(out);
      }
      // Otherwise, redirect to original to leverage browser caching/CDN
      return res.redirect(302, src);
    }

    return res.status(400).json({ msg: 'Unsupported media source' });
  } catch (e) {
    console.error('Get studio media error:', e);
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
