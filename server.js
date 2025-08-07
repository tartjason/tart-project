// server.js
// This file sets up an Express server with a MongoDB connection using Mongoose.

const express = require('express');
const path = require('path');
const mongoose = require('mongoose');

// Create a new Express application
const app = express();
const port = process.env.PORT || 3000;

// Use express.json() middleware to parse JSON in request bodies
// This is the modern replacement for body-parser
app.use(express.json());

// --- MongoDB Connection ---
const mongoURI = 'mongodb://localhost:27017/tart';
mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('MongoDB connected successfully.'))
    .catch(err => console.log('MongoDB connection error:', err));

// --- API Routes ---
// Connect all our API routes to the main application
app.use('/api/auth', require('./routes/auth'));
app.use('/api/artworks', require('./routes/artworks'));
app.use('/api/portfolios', require('./routes/portfolios'));
app.use('/api/artists', require('./routes/artists'));
app.use('/api/website-state', require('./routes/websiteState'));

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