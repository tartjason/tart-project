const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Artist = require('../models/artist');
const Portfolio = require('../models/portfolio');
const Artwork = require('../models/artwork');
const { putBuffer, getUploadsKey, getPublicUrl, deleteObject } = require('../utils/s3');

// Use JWT secret from environment; fall back to a development-only default
const JWT_SECRET = process.env.JWT_SECRET || 'dev-insecure-secret';

// @route   POST api/auth/register
// @desc    Register an artist
// @access  Public
router.post('/register', async (req, res) => {
    const { name, email, password } = req.body;

    try {
        let artist = await Artist.findOne({ email });

        if (artist) {
            return res.status(400).json({ msg: 'Artist already exists' });
        }

        artist = new Artist({
            name,
            email,
            password
        });

        const salt = await bcrypt.genSalt(10);
        artist.password = await bcrypt.hash(password, salt);

        await artist.save();

        // Create a default portfolio for the new artist
        const portfolio = new Portfolio({ artist: artist.id });
        await portfolio.save();

        // Link the portfolio to the artist
        artist.portfolio = portfolio.id;
        await artist.save();

        const payload = {
            artist: {
                id: artist.id
            }
        };

        jwt.sign(
            payload,
            JWT_SECRET, // from environment
            { expiresIn: 3600 },
            (err, token) => {
                if (err) throw err;
                res.json({ token });
            }
        );

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

// @route   POST api/auth/login
// @desc    Authenticate artist & get token
// @access  Public
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        let artist = await Artist.findOne({ email });

        if (!artist) {
            return res.status(400).json({ msg: 'Invalid Credentials' });
        }

        const isMatch = await bcrypt.compare(password, artist.password);

        if (!isMatch) {
            return res.status(400).json({ msg: 'Invalid Credentials' });
        }

        const payload = {
            artist: {
                id: artist.id
            }
        };

        jwt.sign(
            payload,
            JWT_SECRET, // from environment
            { expiresIn: 3600 },
            (err, token) => {
                if (err) throw err;
                res.json({ token });
            }
        );

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

// @route   GET api/auth/me
// @desc    Get current user's data
// @access  Private
const auth = require('../middleware/auth');
router.get('/me', auth, async (req, res) => {
    try {
        // req.artist.id is set by the auth middleware
        const artist = await Artist.findById(req.artist.id)
            .select('-password')
            .populate({
                path: 'collections',
                populate: { 
                    path: 'artist',
                    select: 'name'
                }
            });

        // Find all artworks by this artist and attach them to the response object
        const artworks = await Artwork.find({ artist: req.artist.id }).sort({ date: -1 });

        // We need to convert the mongoose document to a plain object to add a new property
        const artistObject = artist.toObject();
        artistObject.artworks = artworks;

        res.json(artistObject);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   POST api/auth/profile-picture
// @desc    Upload profile picture to S3
// @access  Private
const multer = require('multer');
const path = require('path');

// Configure multer for profile picture uploads (memory, to upload to S3)
const profilePictureUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5000000 }, // 5MB limit
    fileFilter: function (req, file, cb) {
        const allowedTypes = /jpeg|jpg|png|gif/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    }
}).single('profilePicture');

router.post('/profile-picture', auth, (req, res) => {
    profilePictureUpload(req, res, async (err) => {
        if (err) {
            console.error('Profile picture upload error:', err);
            return res.status(400).json({ message: err.message });
        }
        
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }
        
        try {
            const Bucket = process.env.S3_BUCKET;
            if (!Bucket) {
                return res.status(500).json({ message: 'S3 is not configured' });
            }

            // Delete previous profile picture from S3 if exists
            const artist = await Artist.findById(req.artist.id).select('profilePictureKey');
            if (artist && artist.profilePictureKey) {
                try {
                    await deleteObject({ Bucket, Key: artist.profilePictureKey });
                } catch (e) {
                    console.warn('Failed to delete previous profile picture from S3:', e);
                }
            }

            // Upload new picture
            const Key = getUploadsKey(req.artist.id, req.file.originalname, 'profiles');
            await putBuffer({ Bucket, Key, Body: req.file.buffer, ContentType: req.file.mimetype });
            const profilePictureUrl = getPublicUrl(Bucket, Key);

            await Artist.findByIdAndUpdate(req.artist.id, {
                profilePictureUrl,
                profilePictureKey: Key
            });
            
            res.json({ 
                message: 'Profile picture updated successfully',
                profilePictureUrl
            });
        } catch (error) {
            console.error('Database/S3 error:', error);
            res.status(500).json({ message: 'Server error while updating profile picture' });
        }
    });
});

module.exports = router;
