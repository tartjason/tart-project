const express = require('express');
const router = express.Router();

// Use global fetch (Node 18+) to fetch source images
// Lazy-require sharp to avoid boot cost if unused
let sharp = null;

// Security: only allow proxying images from our S3 bucket or CDN domain
function isAllowedSource(urlStr) {
  try {
    const u = new URL(urlStr);
    const cdn = process.env.CDN_DOMAIN ? String(process.env.CDN_DOMAIN).toLowerCase() : null;
    const bucket = process.env.S3_BUCKET ? String(process.env.S3_BUCKET) : null;
    const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
    const s3Host = bucket ? `${bucket}.s3.${region}.amazonaws.com`.toLowerCase() : null;
    if (cdn && u.hostname.toLowerCase() === cdn) return true;
    if (s3Host && u.hostname.toLowerCase() === s3Host) return true;
    // Also allow localhost/static for dev images
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return true;
    return false;
  } catch {
    return false;
  }
}

// GET /api/image/thumbnail?url=<encoded>&w=480&h=auto&q=75
router.get('/thumbnail', async (req, res) => {
  try {
    const url = String(req.query.url || '');
    if (!url || !/^https?:\/\//i.test(url)) {
      return res.status(400).json({ msg: 'Invalid url' });
    }
    if (!isAllowedSource(url)) {
      return res.status(403).json({ msg: 'Source not allowed' });
    }
    const w = Math.max(1, Math.min(2000, parseInt(req.query.w || '480', 10)));
    const hRaw = req.query.h;
    const h = hRaw ? Math.max(1, Math.min(2000, parseInt(hRaw, 10))) : null;
    const q = Math.max(40, Math.min(92, parseInt(req.query.q || '75', 10)));

    // Fetch source image
    const resp = await fetch(url, { cache: 'no-store' });
    if (!resp.ok) {
      return res.status(502).json({ msg: 'Failed to fetch source image' });
    }
    const buf = Buffer.from(await resp.arrayBuffer());

    // Lazy-load sharp
    if (!sharp) sharp = require('sharp');

    let pipeline = sharp(buf).rotate();
    // Resize fit inside box
    pipeline = pipeline.resize({ width: w, height: h || null, fit: 'inside', withoutEnlargement: true });
    // Convert to webp for smaller size
    pipeline = pipeline.webp({ quality: q });

    const outBuf = await pipeline.toBuffer();
    res.set('Content-Type', 'image/webp');
    res.set('Cache-Control', 'public, max-age=86400'); // 1 day
    return res.send(outBuf);
  } catch (err) {
    console.error('thumbnail proxy error:', err);
    return res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
