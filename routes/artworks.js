const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const { putBuffer, getUploadsKey, getPublicUrl, deleteObject } = require('../utils/s3');

// Debug middleware to log all requests
router.use((req, res, next) => {
    console.log(`[ARTWORKS] ${req.method} ${req.path} - ${req.originalUrl}`);
    next();
});

// Models
const Artwork = require('../models/artwork');
const Artist = require('../models/artist');
const Collect = require('../models/Collect');

// --- Multer Setup for File Uploads (memory storage; upload to S3) ---
const storage = multer.memoryStorage();

const upload = multer({
    storage: storage,
    limits: { fileSize: 10000000 }, // 10MB limit
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

// @route   GET api/artworks
// @desc    Get all artworks
// @access  Public
router.get('/', async (req, res) => {
    try {
        const artworks = await Artwork.find().populate('artist', ['name', '_id']).sort({ date: -1 });
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
router.get('/:id', async (req, res) => {
    try {
        const artwork = await Artwork.findById(req.params.id)
            .populate('artist', ['name', 'username', 'profilePictureUrl']); // Populate artist details

        if (!artwork) {
            return res.status(404).json({ msg: 'Artwork not found' });
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
        if (medium === 'photography' || medium === 'painting' || medium === 'oil-painting' || medium === 'ink-painting' || medium === 'colored-pencil') {
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
