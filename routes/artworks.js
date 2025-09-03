const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const { putBuffer, getUploadsKey, getPublicUrl, deleteObject } = require('../utils/s3');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

// Debug middleware to log all requests
router.use((req, res, next) => {
    console.log(`[ARTWORKS] ${req.method} ${req.path} - ${req.originalUrl}`);
    next();
});

// @route   POST api/artworks/home-ranked/refresh
// @desc    Admin: recompute ranked cache immediately (auth required)
// @access  Private
router.post('/home-ranked/refresh', auth, async (req, res) => {
    try {
        const days = Math.min(Math.max(parseInt((req.body && req.body.days) || req.query.days || '14', 10), 1), 60);
        const payload = await computeHomeRanked(days);
        const key = getHomeRankedKey(days);
        homeRankedCache = { key, payload, expiresAt: Date.now() + HOME_RANKED_TTL_MS };
        return res.json({ ok: true, days, size: payload.length, expiresAt: homeRankedCache.expiresAt });
    } catch (err) {
        console.error('Error refreshing home-ranked cache:', err);
        return res.status(500).json({ msg: 'Server error' });
    }
});

// (moved PUT /:id route to below uploadMiddleware)

// --- In-memory cache for ranked home feed ---
// Keep it simple: single-key cache keyed by the 'days' param. TTL = 10 minutes.
let homeRankedCache = { key: null, payload: null, expiresAt: 0 };
const HOME_RANKED_TTL_MS = 10 * 60 * 1000;
function getHomeRankedKey(days) {
    return `days:${days}`;
}
function invalidateHomeRankedCache() {
    homeRankedCache.expiresAt = 0;
    homeRankedCache.key = null;
    homeRankedCache.payload = null;
}

// Shared compute for home-ranked
async function computeHomeRanked(days) {
    const ArtworkEvent = require('../models/ArtworkEvent');
    const now = Date.now();
    const halfLifeHrs = 24; // freshness half-life
    const dwellCapMs = 20000; // 20s cap
    const since = new Date(now - days * 24 * 60 * 60 * 1000);

    const agg = await ArtworkEvent.aggregate([
        { $match: { ts: { $gte: since } } },
        { $group: {
            _id: '$artworkId',
            artistId: { $last: '$artistId' },
            viewStart: { $sum: { $cond: [{ $eq: ['$type', 'view_start'] }, 1, 0] } },
            viewEnd: { $sum: { $cond: [{ $eq: ['$type', 'view_end'] }, 1, 0] } },
            unblur: { $sum: { $cond: [{ $eq: ['$type', 'unblur'] }, 1, 0] } },
            avgDwellMs: { $avg: { $cond: [{ $eq: ['$type', 'view_end'] }, { $ifNull: ['$dwellMs', 0] }, null] } },
            lastTs: { $max: '$ts' },
        }},
    ]);

    // Popularity aggregates: collects and comments per artwork
    // Note: small collections; these group-bys are acceptable. If needed, optimize with cached counts.
    let collectsByArt = new Map();
    let commentsByArt = new Map();
    try {
        const collectsAgg = await Collect.aggregate([
            { $group: { _id: '$artwork', count: { $sum: 1 } } }
        ]);
        collectsAgg.forEach(row => collectsByArt.set(String(row._id), row.count));
    } catch (e) {
        collectsByArt = new Map();
    }
    try {
        const commentsAgg = await Comment.aggregate([
            { $group: { _id: '$artworkId', count: { $sum: 1 } } }
        ]);
        commentsAgg.forEach(row => commentsByArt.set(String(row._id), row.count));
    } catch (e) {
        commentsByArt = new Map();
    }

    const allArts = await Artwork.find({ isPrivate: { $ne: true } })
        .populate('artist', ['name', '_id'])
        .lean();
    const artById = new Map();
    for (const a of allArts) artById.set(String(a._id), a);

    const items = [];
    const pushWith = (art, metrics) => {
        if (!art) return;
        const vs = metrics.viewStart || 0;
        const ub = metrics.unblur || 0;
        const avgDwell = Math.min(Math.max(metrics.avgDwellMs || 0, 0), dwellCapMs) / dwellCapMs; // 0..1
        const ctr = vs > 0 ? Math.min(1, ub / vs) : 0; // proxy intent rate
        const vol = Math.min(1, Math.log10(1 + vs) / 2); // gentle volume term (<= ~0.5 for 100 views)
        const quality = 0.6 * avgDwell + 0.3 * ctr + 0.1 * vol; // 0..1
        const ageMs = Math.max(0, now - new Date(metrics.lastTs || art.date || now).getTime());
        const freshness = Math.pow(0.5, ageMs / (halfLifeHrs * 3600 * 1000)); // 0..1
        const score = 0.6 * quality + 0.4 * freshness; // base weighting
        items.push({ art, artistId: String(art.artist && art.artist._id ? art.artist._id : art.artist), metrics, score });
    };

    const used = new Set();
    for (const m of agg) {
        const art = artById.get(String(m._id));
        if (!art) continue;
        used.add(String(m._id));
        pushWith(art, m);
    }
    for (const art of allArts) {
        const id = String(art._id);
        if (used.has(id)) continue;
        pushWith(art, { viewStart: 0, viewEnd: 0, unblur: 0, avgDwellMs: 0, lastTs: art.date });
    }

    const dayKey = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const bucket = (s) => Math.round(s * 100) / 100; // 0.01 resolution
    const hash = (str) => {
        let h = 2166136261 >>> 0;
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    };
    items.sort((a, b) => {
        if (bucket(b.score) !== bucket(a.score)) return b.score - a.score;
        const ha = hash(dayKey + String(a.art._id));
        const hb = hash(dayKey + String(b.art._id));
        return ha - hb;
    });

    // Diversity for top-4 only: ensure highest quality order but cap to max 2 per artist in top 4.
    // All artworks are included; remaining items follow original sorted order.
    const counts = new Map(); // artistId -> count in top
    const top = [];
    const later = [];
    for (const it of items) {
        if (top.length < 4) {
            const aid = String(it.artistId || (it.art.artist && it.art.artist._id));
            const c = counts.get(aid) || 0;
            if (c >= 2) {
                later.push(it);
            } else {
                counts.set(aid, c + 1);
                top.push(it);
            }
        } else {
            later.push(it);
        }
    }
    const result = top.concat(later);
    
    // Pin newest artwork to the very top for 1 hour
    // This ensures the most recent upload is showcased as the hero temporarily.
    try {
        const ONE_HOUR_MS = 60 * 60 * 1000;
        let newestIdx = -1;
        let newestDateMs = 0;
        for (let i = 0; i < result.length; i++) {
            const d = new Date(result[i].art && result[i].art.date ? result[i].art.date : 0).getTime();
            if (Number.isFinite(d) && d > newestDateMs) {
                newestDateMs = d;
                newestIdx = i;
            }
        }
        if (newestIdx >= 0 && (Date.now() - newestDateMs) < ONE_HOUR_MS) {
            const [pinned] = result.splice(newestIdx, 1);
            result.unshift(pinned);
        }
    } catch (e) {
        // non-fatal; fall back to ranked order
    }

    return result.map(it => ({
        ...it.art,
        score: it.score,
        metrics: {
            unblur: it.metrics.unblur || 0,
            viewStart: it.metrics.viewStart || 0,
            viewEnd: it.metrics.viewEnd || 0,
            avgDwellMs: Math.round(it.metrics.avgDwellMs || 0)
        },
        // Popularity helpers for frontend sorting
        collectsCount: collectsByArt.get(String(it.art._id)) || 0,
        commentsCount: commentsByArt.get(String(it.art._id)) || 0
    }));
}

// Hourly background refresh of cache for default window
const HOME_RANKED_DEFAULT_DAYS = 14;
setTimeout(async () => {
    try {
        const payload = await computeHomeRanked(HOME_RANKED_DEFAULT_DAYS);
        homeRankedCache = { key: getHomeRankedKey(HOME_RANKED_DEFAULT_DAYS), payload, expiresAt: Date.now() + HOME_RANKED_TTL_MS };
        console.log('[home-ranked] cache warmed');
    } catch (e) {
        console.warn('[home-ranked] initial warm failed:', e && e.message ? e.message : e);
    }
}, 5000);
setInterval(async () => {
    try {
        const payload = await computeHomeRanked(HOME_RANKED_DEFAULT_DAYS);
        homeRankedCache = { key: getHomeRankedKey(HOME_RANKED_DEFAULT_DAYS), payload, expiresAt: Date.now() + HOME_RANKED_TTL_MS };
        console.log('[home-ranked] cache refreshed by scheduler');
    } catch (e) {
        console.warn('[home-ranked] scheduled refresh failed:', e && e.message ? e.message : e);
    }
}, 60 * 60 * 1000);

// Models
const Artwork = require('../models/artwork');
const Artist = require('../models/artist');
const Collect = require('../models/Collect');
const Comment = require('../models/comment');
const CommentNotification = require('../models/CommentNotification');

// --- Comments helpers ---
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
    // ensure replies oldest-first
    const repliesArr = Array.isArray(c.replies) ? [...c.replies] : [];
    repliesArr.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const replies = repliesArr.map(r => toReplyShape(r, currentUserId));
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

const JWT_SECRET = process.env.JWT_SECRET || 'dev-insecure-secret';
function getCurrentUserIdFromReq(req) {
    try {
        const token = req.header('x-auth-token');
        if (!token) return null;
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded && typeof decoded === 'object' && decoded.artist && decoded.artist.id) return decoded.artist.id;
        return null;
    } catch (_) { return null; }
}

// --- Multer Setup for File Uploads (memory storage; upload to S3) ---
const storage = multer.memoryStorage();

const upload = multer({
    storage: storage,
    limits: { fileSize: 1000000 }, // 1MB limit for artwork images
    fileFilter: function (req, file, cb) {
        checkFileType(file, cb);
    }
}).single('artworkImage'); // 'artworkImage' is the field name from the form

// Custom middleware to handle multer upload and errors
const uploadMiddleware = (req, res, next) => {
    // Only run Multer when the request is multipart/form-data.
    // For JSON submissions (e.g., poetry), skip Multer entirely so req.body stays parsed by express.json().
    if (!req.is('multipart/form-data')) {
        return next();
    }
    upload(req, res, function (err) {
        if (err) {
            console.error('--- MULTER ERROR ---');
            console.error(err);
            console.error('--- END MULTER ERROR ---');
            if (err instanceof multer.MulterError) {
                // A Multer error occurred when uploading.
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(400).json({ msg: 'File too large. Maximum size is 1MB.' });
                }
                return res.status(400).json({ msg: err.message });
            } else {
                // An unknown error occurred when uploading.
                const message = (typeof err === 'string' ? err : err && err.message) || 'An unknown upload error occurred';
                return res.status(400).json({ msg: message });
            }
        }
        // Everything went fine.
        next();
    });
};

// @route   PUT api/artworks/:id
// @desc    Update an artwork (title/description/location/source/metrics). Optionally replace image or switch medium.
// @access  Private
router.put('/:id', [auth, uploadMiddleware], async (req, res) => {
    try {
        const { id } = req.params;
        const existing = await Artwork.findById(id);
        if (!existing) return res.status(404).json({ msg: 'Artwork not found' });
        if (String(existing.artist) !== String(req.artist.id)) {
            return res.status(403).json({ msg: 'Not authorized to update this artwork' });
        }

        const body = req.body || {};
        const title = typeof body.title === 'string' ? body.title.trim() : existing.title;
        const description = typeof body.description === 'string' ? body.description.trim() : (existing.description || '');
        const nextMedium = body.medium ? String(body.medium).toLowerCase() : existing.medium;
        const source = body.source ? String(body.source).toLowerCase() : existing.source;
        const locationCountry = typeof body.locationCountry === 'string' ? body.locationCountry.trim() : (existing.locationCountry || '');
        const locationCity = typeof body.locationCity === 'string' ? body.locationCity.trim() : (existing.locationCity || '');
        const legacyLocation = typeof body.location === 'string' ? body.location.trim() : (existing.location || '');

        if (!title) return res.status(400).json({ msg: 'Title is required' });
        if (!nextMedium) return res.status(400).json({ msg: 'Medium is required' });

        const clampNum = (v) => {
            const n = Number(v);
            return Number.isFinite(n) && n >= 0 ? n : undefined;
        };
        const validUnit = (u) => (['cm', 'in', 'mm'].includes(String(u)) ? String(u) : undefined);
        const composeLocation = () => {
            const parts = [];
            if (locationCity) parts.push(locationCity);
            if (locationCountry) parts.push(locationCountry);
            if (parts.length) return parts.join(', ');
            return legacyLocation || existing.location || 'Not specified';
        };

        function sanitizeLineHtml(html) {
            if (typeof html !== 'string') return '';
            let clean = html
                .replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, '')
                .replace(/ on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
            clean = clean.replace(/<\/?([a-zA-Z0-9-]+)([^>]*)>/g, (m, tag, attrs) => {
                const isClosing = m.startsWith('</');
                const t = tag.toLowerCase();
                if (['b', 'i', 'u', 's', 'strike', 'strong', 'em', 'br'].includes(t)) {
                    return isClosing ? `</${t}>` : `<${t}>`;
                }
                if (t === 'font') {
                    if (isClosing) return '</span>';
                    const colorMatch = attrs && attrs.match(/color\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
                    const color = colorMatch ? (colorMatch[2] || colorMatch[3] || colorMatch[4] || '').trim() : '';
                    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(color)) {
                        return `<span style=\"color: ${color}\">`;
                    }
                    return '<span>';
                }
                if (t === 'span') {
                    if (isClosing) return '</span>';
                    let color = '';
                    const styleMatch = attrs && attrs.match(/style\s*=\s*("([^"]*)"|'([^']*)')/i);
                    const style = styleMatch ? (styleMatch[2] || styleMatch[3] || '') : '';
                    const colorMatch = style.match(/color\s*:\s*([^;]+)/i);
                    if (colorMatch) color = colorMatch[1].trim();
                    return color ? `<span style=\"color: ${color}\">` : '<span>';
                }
                return m.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            });
            return clean;
        }

        // Prepare update payload
        const update = {
            title,
            description,
            medium: nextMedium,
            location: composeLocation(),
            locationCountry: locationCountry || undefined,
            locationCity: locationCity || undefined,
            source: source && ['human', 'ai'].includes(source) ? source : undefined
        };

        // Handle modes
        if (nextMedium === 'poetry') {
            // Poetry update: expect poem JSON; clear image and metrics if switching
            const poem = body.poem && typeof body.poem === 'object' ? body.poem : null;
            if (!poem || !Array.isArray(poem.lines)) {
                return res.status(400).json({ msg: 'Poem content is required' });
            }
            const MAX_LINES = 300;
            const MAX_HTML = 4000;
            const safeLines = poem.lines.slice(0, MAX_LINES).map((line) => ({
                html: sanitizeLineHtml(String(line.html || '').slice(0, MAX_HTML)),
                color: typeof line.color === 'string' ? line.color : undefined,
                indent: clampNum(line.indent) ?? 0,
                spacing: clampNum(line.spacing) ?? 0
            }));
            update.poem = { lines: safeLines };
            update.metrics2d = undefined;
            update.metrics3d = undefined;

            // If previously had an image, delete it from S3/local and clear fields
            if (existing.imageKey) {
                try {
                    const Bucket = process.env.S3_BUCKET;
                    if (Bucket) await deleteObject({ Bucket, Key: existing.imageKey });
                } catch (e) { console.warn('Failed to delete previous S3 image on poetry switch:', e); }
            }
            update.imageUrl = undefined;
            update.imageKey = undefined;
        } else {
            // Non-poetry: optionally replace image
            if (req.file) {
                const Bucket = process.env.S3_BUCKET;
                if (!Bucket) return res.status(500).json({ msg: 'S3 is not configured' });
                const Key = getUploadsKey(req.artist.id, req.file.originalname, 'artworks');
                await putBuffer({ Bucket, Key, Body: req.file.buffer, ContentType: req.file.mimetype });
                const publicUrl = getPublicUrl(Bucket, Key);
                // delete old image if existed
                if (existing.imageKey) {
                    try { await deleteObject({ Bucket, Key: existing.imageKey }); } catch (e) { console.warn('Failed to delete old S3 image:', e); }
                }
                update.imageUrl = publicUrl;
                update.imageKey = Key;
            }

            // Metrics parsing depending on medium
            let metrics2d, metrics3d;
            if (nextMedium === 'photography' || nextMedium === 'painting' || nextMedium === 'oil-painting' || nextMedium === 'ink-painting' || nextMedium === 'colored-pencil' || nextMedium === 'sketch') {
                const w = clampNum(body.width);
                const h = clampNum(body.height);
                const u = validUnit(body.units);
                if ((w !== undefined || h !== undefined) && u) metrics2d = { width: w, height: h, units: u };
            } else if (nextMedium === 'industrial-design' || nextMedium === 'furniture') {
                const L = clampNum(body.length);
                const W = clampNum(body.width3d);
                const H = clampNum(body.height3d);
                const U = validUnit(body.units3d);
                if ((L !== undefined || W !== undefined || H !== undefined) && U) metrics3d = { length: L, width: W, height: H, units: U };
            }
            if (metrics2d) {
                update.metrics2d = metrics2d;
                update.metrics3d = undefined;
            } else if (metrics3d) {
                update.metrics3d = metrics3d;
                update.metrics2d = undefined;
            } else {
                // If medium changed from 2D to 3D or vice versa without new metrics, clear the old metrics to avoid mismatch
                if (existing.metrics2d && (nextMedium === 'industrial-design' || nextMedium === 'furniture')) update.metrics2d = undefined;
                if (existing.metrics3d && (nextMedium === 'photography' || nextMedium === 'painting' || nextMedium === 'oil-painting' || nextMedium === 'ink-painting' || nextMedium === 'colored-pencil' || nextMedium === 'sketch')) update.metrics3d = undefined;
            }

            // If switching from poetry to non-poetry, clear poem
            if (existing.medium === 'poetry') update.poem = undefined;
        }

        // Apply updates
        await Artwork.updateOne({ _id: id }, { $set: update });
        const updated = await Artwork.findById(id).populate('artist', ['name', 'username', 'profilePictureUrl']);
        return res.json(updated);
    } catch (err) {
        console.error('Artwork update error:', err);
        return res.status(500).json({ msg: 'Server Error', error: err.message });
    }
});

// @route   GET api/artworks/home-ranked
// @desc    Ranked home feed using minimal quality signals from ArtworkEvent
// @access  Public
router.get('/home-ranked', async (req, res) => {
    try {
        const ArtworkEvent = require('../models/ArtworkEvent');
        // time window for events (days)
        const days = Math.min(Math.max(parseInt(req.query.days || '14', 10), 1), 60);
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

        // cache check
        const force = String(req.query.force || '').toLowerCase() === 'true';
        const key = getHomeRankedKey(days);
        if (!force && homeRankedCache.payload && homeRankedCache.key === key && homeRankedCache.expiresAt > Date.now()) {
            return res.json(homeRankedCache.payload);
        }

        // Compute payload using shared function
        const payload = await computeHomeRanked(days);
        // set cache
        homeRankedCache = { key, payload, expiresAt: Date.now() + HOME_RANKED_TTL_MS };
        return res.json(payload);
    } catch (err) {
        console.error('Error computing home-ranked feed:', err);
        return res.status(500).json({ msg: 'Server error' });
    }
});

// @route   GET api/artworks
// @desc    Get all artworks
// @access  Public
router.get('/', async (req, res) => {
    try {
        // Public feed excludes private artworks
        const artworks = await Artwork.find({ isPrivate: { $ne: true } })
            .populate('artist', ['name', '_id'])
            .sort({ date: -1 });
        console.log('[/api/artworks] Sending artworks:', JSON.stringify(artworks, null, 2)); // DEBUG LOG
        res.json(artworks);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// DELETE /api/artworks/:id - Delete an artwork (only by the artist who created it)
router.delete('/:id', auth, async (req, res) => {
    try {
        console.log('DELETE route called with ID:', req.params.id);
        console.log('Authenticated user ID:', req.artist.id);
        
        const artwork = await Artwork.findById(req.params.id);
        console.log('Found artwork:', !!artwork);
        
        if (!artwork) {
            console.log('Artwork not found in database');
            return res.status(404).json({ msg: 'Artwork not found' });
        }
        
        // Check if the authenticated user is the artist who created this artwork
        if (artwork.artist.toString() !== req.artist.id) {
            return res.status(403).json({ msg: 'Not authorized to delete this artwork' });
        }
        
        // Remove artwork from all collections that include it
        await Artist.updateMany(
            { collections: artwork._id },
            { $pull: { collections: artwork._id } }
        );

        // Remove collection notification records for this artwork
        try {
            await Collect.deleteMany({ artwork: artwork._id });
        } catch (e) {
            console.warn('Failed to delete Collect records for artwork:', artwork._id, e);
        }
        
        // Delete from S3 if we have an imageKey; otherwise fallback to local filesystem deletion
        if (artwork.imageKey) {
            try {
                const Bucket = process.env.S3_BUCKET;
                if (Bucket) {
                    await deleteObject({ Bucket, Key: artwork.imageKey });
                    console.log('Deleted artwork image from S3:', artwork.imageKey);
                }
            } catch (e) {
                console.warn('Failed to delete artwork image from S3:', e);
            }
        } else if (artwork.imageUrl) {
            // Backward-compat for previously saved local files
            const fs = require('fs');
            const path = require('path');
            try {
                const rel = artwork.imageUrl.startsWith('/') ? artwork.imageUrl.slice(1) : artwork.imageUrl;
                const imagePath = path.join(__dirname, '..', 'public', rel);
                fs.unlink(imagePath, (err) => {
                    if (err) {
                        console.error('Error deleting local image file:', err);
                    } else {
                        console.log('Local image file deleted successfully:', imagePath);
                    }
                });
            } catch (e) {
                console.warn('Failed to delete local image file:', e);
            }
        }
        
        // Delete the artwork from database
        await Artwork.findByIdAndDelete(req.params.id);
        
        res.json({ msg: 'Artwork deleted successfully' });
        
    } catch (error) {
        console.error('Error deleting artwork:', error.message, error.stack);
        res.status(500).json({ msg: 'Server error while deleting artwork' });
    }
});

// @route   GET api/artworks/user
// @desc    Get artworks uploaded by the authenticated user
// @access  Private
router.get('/user', auth, async (req, res) => {
    try {
        const artworks = await Artwork.find({ artist: req.artist.id })
            .sort({ date: -1 });
        return res.json(artworks);
    } catch (err) {
        console.error('Error fetching user artworks:', err.message);
        return res.status(500).send('Server Error');
    }
});

// @route   GET api/artworks/:id
// @desc    Get a single artwork by ID
// @access  Public
// --- Comments: list top-level comments for an artwork (newest-first, cursor by createdAt) ---
router.get('/:artworkId/comments', async (req, res) => {
    try {
        const { artworkId } = req.params;
        if (!mongoose.isValidObjectId(artworkId)) return res.status(404).json({ msg: 'Artwork not found' });
        const limitRaw = Number(req.query.limit);
        const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(50, limitRaw)) : 10;
        const cursorStr = req.query.cursor ? String(req.query.cursor) : null;
        let cursorDate = null;
        if (cursorStr) {
            const t = new Date(cursorStr);
            if (!isNaN(t.getTime())) cursorDate = t;
        }

        // verify artwork existence (optional but helpful)
        const art = await Artwork.findById(artworkId).select('_id artist isPrivate');
        if (!art) return res.status(404).json({ msg: 'Artwork not found' });
        // Disallow comments listing on private artworks for non-owners
        if (art.isPrivate) {
            const me = getCurrentUserIdFromReq(req);
            if (!me || String(me) !== String(art.artist)) return res.status(404).json({ msg: 'Artwork not found' });
        }

        const filter = { artworkId };
        if (cursorDate) filter.createdAt = { $lt: cursorDate };

        const docs = await Comment.find(filter)
            .sort({ createdAt: -1 })
            .limit(limit)
            .populate('author', 'name username profilePictureUrl')
            .populate('replies.author', 'name username profilePictureUrl');

        const currentUserId = getCurrentUserIdFromReq(req);
        const comments = docs.map(d => toCommentShape(d, currentUserId));
        const last = comments[comments.length - 1];
        const nextCursor = last ? last.createdAt : null;
        return res.json({ comments, nextCursor });
    } catch (err) {
        console.error('Error listing artwork comments:', err);
        return res.status(500).json({ msg: 'Server error' });
    }
});

// --- Comments: create a new top-level comment on artwork ---
router.post('/:artworkId/comments', auth, async (req, res) => {
    try {
        const { artworkId } = req.params;
        if (!mongoose.isValidObjectId(artworkId)) return res.status(404).json({ msg: 'Artwork not found' });
        const text = String((req.body && req.body.text) || '').trim();
        if (!text) return res.status(400).json({ msg: 'Text is required' });

        const art = await Artwork.findById(artworkId);
        if (!art) return res.status(404).json({ msg: 'Artwork not found' });

        const doc = new Comment({ artworkId, author: req.artist.id, text });
        await doc.save();
        // Notify artwork owner when someone comments on their artwork (but not on replies)
        try {
            const me = req.artist.id;
            const toArtist = art.artist;
            if (toArtist && String(toArtist) !== String(me)) {
                await CommentNotification.create({
                    toArtist: toArtist,
                    fromArtist: me,
                    type: 'comment',
                    targetType: 'comment',
                    commentId: doc._id,
                });
            }
        } catch (notifyErr) {
            console.warn('Artwork comment notification error (non-fatal):', notifyErr && notifyErr.message ? notifyErr.message : notifyErr);
        }
        const saved = await Comment.findById(doc._id)
            .populate('author', 'name username profilePictureUrl')
            .populate('replies.author', 'name username profilePictureUrl');
        return res.status(201).json({ comment: toCommentShape(saved, req.artist.id) });
    } catch (err) {
        console.error('Error creating comment:', err);
        return res.status(500).json({ msg: 'Server error' });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const artwork = await Artwork.findById(req.params.id)
            .populate('artist', ['name', 'username', 'profilePictureUrl']); // Populate artist details

        if (!artwork) {
            return res.status(404).json({ msg: 'Artwork not found' });
        }

        // Hide private artworks from non-owners
        if (artwork.isPrivate) {
            const me = getCurrentUserIdFromReq(req);
            if (!me || String(me) !== String(artwork.artist && artwork.artist._id ? artwork.artist._id : artwork.artist)) {
                return res.status(404).json({ msg: 'Artwork not found' });
            }
        }

        // Prepare output object with legacy fallbacks and computed fields
        const obj = artwork.toObject({ virtuals: true });
        if (!obj.poem && Array.isArray(obj.poetryData) && obj.poetryData.length) {
            // Legacy: convert simple poetryData to poem.lines with escaped text
            const escape = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            obj.poem = {
                lines: obj.poetryData.map((p) => ({
                    html: escape(p.text || ''),
                    color: p.color || undefined,
                    indent: 0,
                    spacing: 0
                }))
            };
        }
        // Convert previously stored escaped <font color> tags to safe <span style="color:"> for rendering
        if (obj.poem && Array.isArray(obj.poem.lines)) {
            const convertEscapedFontToSpan = (html) => {
                if (typeof html !== 'string') return '';
                // Handle escaped opening font tags
                html = html.replace(/&lt;\s*font([^&]*)&gt;/gi, (m, attrs) => {
                    const colorMatch = String(attrs).match(/color\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
                    const color = colorMatch ? (colorMatch[2] || colorMatch[3] || colorMatch[4] || '').trim() : '';
                    // Only allow hex colors
                    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(color)) {
                        return `<span style="color: ${color}">`;
                    }
                    return '<span>';
                });
                // Handle escaped closing font tags
                html = html.replace(/&lt;\s*\/\s*font\s*&gt;/gi, '</span>');
                return html;
            };
            obj.poem.lines = obj.poem.lines.map((ln) => ({
                ...ln,
                html: convertEscapedFontToSpan(ln.html)
            }));
        }
        if (!obj.locationDisplay) {
            const parts = [];
            if (obj.locationCity) parts.push(obj.locationCity);
            if (obj.locationCountry) parts.push(obj.locationCountry);
            obj.locationDisplay = parts.length ? parts.join(', ') : (obj.location || 'Unknown');
        }

        res.json(obj);
    } catch (err) {
        console.error(err.message);
        if (err.kind === 'ObjectId') {
            return res.status(404).json({ msg: 'Artwork not found' });
        }
        res.status(500).send('Server Error');
    }
});

// @route   PUT api/artworks/:id/hide
// @desc    Toggle artwork privacy (hide/unhide). Only owner can change.
// @access  Private
router.put('/:id/hide', auth, async (req, res) => {
    try {
        const { id } = req.params;
        const art = await Artwork.findById(id);
        if (!art) return res.status(404).json({ msg: 'Artwork not found' });
        if (String(art.artist) !== String(req.artist.id)) return res.status(403).json({ msg: 'Not authorized' });
        const next = (typeof req.body?.isPrivate === 'boolean') ? req.body.isPrivate
                    : (typeof req.body?.hide === 'boolean') ? req.body.hide
                    : true; // default to hide if not specified
        art.isPrivate = !!next;
        await art.save();
        const populated = await Artwork.findById(id).populate('artist', ['name', 'username', 'profilePictureUrl']);
        return res.json(populated);
    } catch (err) {
        console.error('Error toggling artwork privacy:', err);
        return res.status(500).json({ msg: 'Server error' });
    }
});

// Check File Type
function checkFileType(file, cb) {
    // Allowed ext
    const filetypes = /jpeg|jpg|png|gif|webp|heic|heif/;
    // Check ext
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    // Check mime
    const mimetype = filetypes.test(file.mimetype);

    if (mimetype && extname) {
        return cb(null, true);
    }
    cb(new Error('Images Only!'));
}

// @route   POST api/artworks
// @desc    Create an artwork
// @access  Private
router.post('/', [auth, uploadMiddleware], async (req, res) => {
    try {
        // Shared fields (available for both JSON and multipart)
        const body = req.body || {};
        const title = (body.title || '').trim();
        const description = (body.description || '').trim();
        const medium = String(body.medium || '').toLowerCase();
        const source = body.source ? String(body.source).toLowerCase() : undefined; // 'human' | 'ai'
        const locationCountry = (body.locationCountry || '').trim();
        const locationCity = (body.locationCity || '').trim();
        const legacyLocation = (body.location || '').trim();

        if (!title) {
            return res.status(400).json({ msg: 'Title is required' });
        }
        if (!medium) {
            return res.status(400).json({ msg: 'Medium is required' });
        }

        // Helpers
        const clampNum = (v) => {
            const n = Number(v);
            return Number.isFinite(n) && n >= 0 ? n : undefined;
        };
        const validUnit = (u) => (['cm', 'in', 'mm'].includes(String(u)) ? String(u) : undefined);
        const composeLocation = () => {
            const parts = [];
            if (locationCity) parts.push(locationCity);
            if (locationCountry) parts.push(locationCountry);
            if (parts.length) return parts.join(', ');
            return legacyLocation || 'Not specified';
        };

        // Minimal HTML sanitizer for poem lines (allow b,i,u,s/strike,strong,em, br, span[color]; convert <font color> to span)
        function sanitizeLineHtml(html) {
            if (typeof html !== 'string') return '';
            let clean = html
                .replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, '')
                .replace(/ on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
            clean = clean.replace(/<\/?([a-zA-Z0-9-]+)([^>]*)>/g, (m, tag, attrs) => {
                const isClosing = m.startsWith('</');
                const t = tag.toLowerCase();
                if (['b', 'i', 'u', 's', 'strike', 'strong', 'em', 'br'].includes(t)) {
                    return isClosing ? `</${t}>` : `<${t}>`;
                }
                if (t === 'font') {
                    if (isClosing) return '</span>';
                    const colorMatch = attrs && attrs.match(/color\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
                    const color = colorMatch ? (colorMatch[2] || colorMatch[3] || colorMatch[4] || '').trim() : '';
                    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(color)) {
                        return `<span style="color: ${color}">`;
                    }
                    return '<span>';
                }
                if (t === 'span') {
                    if (isClosing) return '</span>';
                    let color = '';
                    const styleMatch = attrs && attrs.match(/style\s*=\s*("([^"]*)"|'([^']*)')/i);
                    const style = styleMatch ? (styleMatch[2] || styleMatch[3] || '') : '';
                    const colorMatch = style.match(/color\s*:\s*([^;]+)/i);
                    if (colorMatch) color = colorMatch[1].trim();
                    return color ? `<span style="color: ${color}">` : '<span>';
                }
                // Escape other tags
                return m
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;');
            });
            return clean;
        }

        // --- Poetry flow (JSON, no image required) ---
        if (medium === 'poetry') {
            const poem = body.poem && typeof body.poem === 'object' ? body.poem : null;
            if (!poem || !Array.isArray(poem.lines)) {
                return res.status(400).json({ msg: 'Poem content is required' });
            }
            // Size limits
            const MAX_LINES = 300;
            const MAX_HTML = 4000;
            const safeLines = poem.lines.slice(0, MAX_LINES).map((line) => ({
                html: sanitizeLineHtml(String(line.html || '').slice(0, MAX_HTML)),
                color: typeof line.color === 'string' ? line.color : undefined,
                indent: clampNum(line.indent) ?? 0,
                spacing: clampNum(line.spacing) ?? 0
            }));

            const artworkData = {
                title,
                description,
                medium,
                artist: req.artist.id,
                location: composeLocation(),
                locationCountry: locationCountry || undefined,
                locationCity: locationCity || undefined,
                source: source && ['human', 'ai'].includes(source) ? source : undefined,
                poem: { lines: safeLines }
            };

            const newArtwork = new Artwork(artworkData);
            const saved = await newArtwork.save();
            console.log('Poetry artwork saved:', saved._id);
            // Invalidate ranked home cache on new upload
            invalidateHomeRankedCache();
            return res.json(saved);
        }

        // --- Non-poetry flow (multipart with image) ---
        if (!req.file) {
            return res.status(400).json({ msg: 'Please upload a file' });
        }

        console.log('Processing artwork upload:', {
            title,
            medium,
            originalname: req.file.originalname,
            size: req.file.size
        });

        // Upload to S3 (required for non-poetry)
        const Bucket = process.env.S3_BUCKET;
        if (!Bucket) {
            return res.status(500).json({ msg: 'S3 is not configured' });
        }
        const Key = getUploadsKey(req.artist.id, req.file.originalname, 'artworks');
        await putBuffer({ Bucket, Key, Body: req.file.buffer, ContentType: req.file.mimetype });
        const publicUrl = getPublicUrl(Bucket, Key);

        // Metrics parsing
        let metrics2d, metrics3d;
        if (medium === 'photography' || medium === 'painting' || medium === 'oil-painting' || medium === 'ink-painting' || medium === 'colored-pencil' || medium === 'sketch') {
            const w = clampNum(body.width);
            const h = clampNum(body.height);
            const u = validUnit(body.units);
            if ((w !== undefined || h !== undefined) && u) {
                metrics2d = { width: w, height: h, units: u };
            }
        } else if (medium === 'industrial-design' || medium === 'furniture') {
            const L = clampNum(body.length);
            const W = clampNum(body.width3d);
            const H = clampNum(body.height3d);
            const U = validUnit(body.units3d);
            if ((L !== undefined || W !== undefined || H !== undefined) && U) {
                metrics3d = { length: L, width: W, height: H, units: U };
            }
        }

        const artworkData = {
            title,
            description,
            medium,
            artist: req.artist.id,
            location: composeLocation(),
            locationCountry: locationCountry || undefined,
            locationCity: locationCity || undefined,
            source: source && ['human', 'ai'].includes(source) ? source : undefined,
            imageUrl: publicUrl,
            imageKey: Key,
            ...(metrics2d ? { metrics2d } : {}),
            ...(metrics3d ? { metrics3d } : {})
        };

        console.log('Creating artwork with data:', artworkData);
        const newArtwork = new Artwork(artworkData);
        const artwork = await newArtwork.save();
        console.log('Artwork saved successfully:', artwork._id);
        // Invalidate ranked home cache on new upload
        invalidateHomeRankedCache();
        return res.json(artwork);
    } catch (err) {
        console.error('Artwork upload error:', err);
        console.error('Error stack:', err.stack);
        return res.status(500).json({ msg: 'Server Error', error: err.message });
    }
});

// @route   PUT api/artworks/:id/collect
// @desc    Collect or un-collect an artwork
// @access  Private
router.put('/:id/collect', auth, async (req, res) => {
    try {
        const artwork = await Artwork.findById(req.params.id);
        const artist = await Artist.findById(req.artist.id);

        if (!artwork || !artist) {
            return res.status(404).json({ msg: 'Artwork or Artist not found' });
        }

        const isCollected = artist.collections.some(id => id.equals(artwork._id));

        if (isCollected) {
            // --- Un-collect the artwork ---
            artist.collections.pull(artwork._id);
            artwork.collectedBy.pull(artist._id);
            // Delete collection notification record
            try {
                await Collect.deleteOne({ collector: artist._id, artwork: artwork._id });
            } catch (e) {
                console.warn('Failed to remove Collect record on un-collect:', e);
            }
        } else {
            // --- Collect the artwork ---
            artist.collections.push(artwork._id);
            artwork.collectedBy.push(artist._id);
            // Create (or ensure) collection notification record for the artwork owner
            try {
                const ownerId = String(artwork.artist);
                const collectorId = String(artist._id);
                if (ownerId !== collectorId) {
                    await Collect.updateOne(
                        { collector: artist._id, artwork: artwork._id },
                        { $setOnInsert: { toArtist: artwork.artist } },
                        { upsert: true }
                    );
                }
            } catch (e) {
                console.warn('Failed to upsert Collect record on collect:', e);
            }
        }

        await artwork.save();
        await artist.save();

        // Return the full updated artwork to the client
        const updatedArtwork = await Artwork.findById(req.params.id).populate('artist', 'name username');
        res.json(updatedArtwork);

    } catch (error) {
        console.error('Error toggling collection:', error);
        res.status(500).json({ msg: 'Server error' });
    }
});

module.exports = router;
