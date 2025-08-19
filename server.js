// server.js
// This file sets up an Express server with a MongoDB connection using Mongoose.

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const mongoose = require('mongoose');
const { getObjectStream, getSitesKey } = require('./utils/s3');

// Create a new Express application
const app = express();
const port = process.env.PORT || 3000;

// Safe startup log (no secrets)
console.log('[ENV] S3_BUCKET set:', !!process.env.S3_BUCKET, 'AWS_REGION:', process.env.AWS_REGION || 'unset');

// Use express.json() middleware to parse JSON in request bodies
// This is the modern replacement for body-parser
app.use(express.json());

// --- MongoDB Connection ---
const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/tart';
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

// --- Backend proxy for compiled site JSON in S3 ---
app.get('/sites/:artistId/site.json', async (req, res) => {
    try {
        const Bucket = process.env.S3_BUCKET;
        if (!Bucket) {
            return res.status(500).json({ msg: 'S3 is not configured' });
        }
        const Key = getSitesKey(req.params.artistId);
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
            return res.status(404).json({ msg: 'Not found' });
        }
        console.error('Error proxying site.json from S3:', err);
        return res.status(500).json({ msg: 'Server error' });
    }
});

// --- Frontend Routes ---
// Serve static files from the 'public' directory (HTML, CSS, JS)
app.use(express.static(path.join(__dirname, 'public')));

// For any other request, serve the main index.html file.
// This is key for single-page applications.
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Server Start ---
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});