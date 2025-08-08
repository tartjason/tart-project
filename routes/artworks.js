const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const multer = require('multer');
const path = require('path');

// Debug middleware to log all requests
router.use((req, res, next) => {
    console.log(`[ARTWORKS] ${req.method} ${req.path} - ${req.originalUrl}`);
    next();
});

// Models
const Artwork = require('../models/artwork');
const Artist = require('../models/Artist');

// --- Multer Setup for File Uploads ---
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10000000 }, // 10MB limit
    fileFilter: function (req, file, cb) {
        checkFileType(file, cb);
    }
}).single('artworkImage'); // 'artworkImage' is the field name from the form

// Custom middleware to handle multer upload and errors
const uploadMiddleware = (req, res, next) => {
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
                return res.status(400).json({ msg: err.message || 'An unknown upload error occurred' });
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
        
        // Delete the image file from filesystem
        const fs = require('fs');
        const path = require('path');
        if (artwork.imageUrl) {
            const imagePath = path.join(__dirname, '..', 'public', artwork.imageUrl);
            fs.unlink(imagePath, (err) => {
                if (err) {
                    console.error('Error deleting image file:', err);
                } else {
                    console.log('Image file deleted successfully:', imagePath);
                }
            });
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

        res.json(artwork);
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
    const filetypes = /jpeg|jpg|png|gif/;
    // Check ext
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    // Check mime
    const mimetype = filetypes.test(file.mimetype);

    if (mimetype && extname) {
        return cb(null, true);
    }
    cb('Error: Images Only!');
}

// @route   POST api/artworks
// @desc    Create an artwork
// @access  Private
router.post('/', [auth, uploadMiddleware], async (req, res) => {
    const { title, description, medium, location } = req.body;

    // All mediums now require an image file (poetry generates one from canvas)
    if (!req.file) {
        return res.status(400).json({ msg: 'Please upload a file' });
    }

    try {
        console.log('Processing artwork upload:', { title, medium, location, filename: req.file.filename });
        
        const artworkData = {
            title,
            description,
            medium,
            location: location || 'Not specified',
            artist: req.artist.id,
            imageUrl: '/uploads/' + req.file.filename
        };

        console.log('Creating artwork with data:', artworkData);
        
        const newArtwork = new Artwork(artworkData);
        const artwork = await newArtwork.save();
        
        console.log('Artwork saved successfully:', artwork._id);
        res.json(artwork);
    } catch (err) {
        console.error('Artwork upload error:', err);
        console.error('Error stack:', err.stack);
        res.status(500).json({ msg: 'Server Error', error: err.message });
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
        } else {
            // --- Collect the artwork ---
            artist.collections.push(artwork._id);
            artwork.collectedBy.push(artist._id);
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
