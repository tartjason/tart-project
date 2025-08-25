// server.js
// This file sets up an Express server with a MongoDB connection using Mongoose.

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const mongoose = require('mongoose');
const { getObjectStream, getSitesKey } = require('./utils/s3');
const passport = require('./middleware/passport');

// Create a new Express application
const app = express();
const port = process.env.PORT || 3000;

// Safe startup log (no secrets)
console.log('[ENV] S3_BUCKET set:', !!process.env.S3_BUCKET, 'AWS_REGION:', process.env.AWS_REGION || 'unset');
console.log('[ENV] MONGODB_URI present:', !!process.env.MONGODB_URI, 'uses SRV:', (process.env.MONGODB_URI || '').startsWith('mongodb+srv://'));

// Use express.json() middleware to parse JSON in request bodies
// This is the modern replacement for body-parser
app.use(express.json());
// Initialize Passport (Google OAuth configured in middleware/passport)
app.use(passport.initialize());

// --- MongoDB Connection ---
const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/tart';
console.log('[DB] Connecting to MongoDB. Using localhost fallback?', !process.env.MONGODB_URI);
mongoose.connect(mongoURI)
    .then(() => console.log('MongoDB connected successfully.'))
    .catch(err => console.log('MongoDB connection error:', err));

// --- API Routes ---
// Connect all our API routes to the main application
app.use('/api/auth', require('./routes/auth'));
app.use('/api/artworks', require('./routes/artworks'));
app.use('/api/portfolios', require('./routes/portfolios'));
app.use('/api/artists', require('./routes/artists'));
app.use('/api/website-state', require('./routes/websiteState'));
app.use('/api/public', require('./routes/public'));
app.use('/api/notifications', require('./routes/notifications'));
// Uploads (images to S3/CDN)
app.use('/api/uploads', require('./routes/uploads'));

// --- Backend proxy for compiled site JSON in S3 ---
app.get('/sites/:artistId/site.json', async (req, res) => {
    try {
        const Bucket = process.env.S3_BUCKET;
        const artistId = req.params.artistId;
        const localPath = path.join(__dirname, 'public', 'sites', artistId, 'site.json');
        const serveLocal = () => {
            if (fs.existsSync(localPath)) {
                return res.sendFile(localPath);
            }
            return res.status(404).json({ msg: 'Not found' });
        };

        if (!Bucket) {
            // Fallback to local file when S3 isn't configured (dev)
            return serveLocal();
        }

        const Key = getSitesKey(artistId);
        try {
            const { stream, contentType } = await getObjectStream({ Bucket, Key });
            res.set('Content-Type', contentType || 'application/json');
            stream.on('error', (err) => {
                console.error('S3 stream error:', err);
                if (!res.headersSent) res.status(500).json({ msg: 'Error streaming S3 object' });
            });
            stream.pipe(res);
        } catch (err) {
            const status = (err && err.$metadata && err.$metadata.httpStatusCode) || 500;
            if (status === 404) {
                // Fallback to local if object not found in S3
                return serveLocal();
            }
            throw err;
        }
    } catch (err) {
        const status = (err && err.$metadata && err.$metadata.httpStatusCode) || 500;
        if (status === 404) {
            return res.status(404).json({ msg: 'Not found' });
        }
        console.error('Error proxying site.json from S3:', err);
        return res.status(500).json({ msg: 'Server error' });
    }
});

// --- Frontend Routes ---
// Serve static files from the 'public' directory (HTML, CSS, JS)
app.use(express.static(path.join(__dirname, 'public')));

// Back-compat: redirect /s/:slug to root-level /:slug
app.get('/s/:slug', (req, res) => {
    const slug = String(req.params.slug || '');
    return res.redirect(301, `/${encodeURIComponent(slug)}`);
});

// Public site viewer at root (e.g., /john-doe) for production domain
// Avoid intercepting API, assets, or files (anything with a dot)
app.get('/:slug', (req, res, next) => {
    const slug = String(req.params.slug || '').toLowerCase();
    const reserved = new Set([
        'api', 'sites', 'js', 'css', 'uploads', 'static', 'assets', 'images', 'img', 'fonts',
        'favicon.ico', 'robots.txt', 's', 'site.html', 'index.html'
    ]);
    if (!slug || reserved.has(slug) || slug.includes('.')) return next();
    return res.sendFile(path.join(__dirname, 'public', 'site.html'));
});

// For any other request, serve the main index.html file.
// This is key for single-page applications.
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Server Start ---
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});