const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Artist = require('../models/artist');
const Portfolio = require('../models/portfolio');
const Artwork = require('../models/artwork');
const VerificationCode = require('../models/VerificationCode');
const { sendEmail } = require('../utils/ses');
const passport = require('../middleware/passport');
const { putBuffer, getUploadsKey, getPublicUrl, deleteObject } = require('../utils/s3');

// Use JWT secret from environment; fall back to a development-only default
const JWT_SECRET = process.env.JWT_SECRET || 'dev-insecure-secret';
const OTP_TTL_MINUTES = 10;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_ATTEMPTS = 5;

function isValidEmail(email) {
    return typeof email === 'string' && /.+@.+\..+/.test(email);
}

function genCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

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

// Email OTP: request code
// @route   POST api/auth/otp/email/request
// @access  Public
router.post('/otp/email/request', async (req, res) => {
    try {
        const email = String((req.body && req.body.email) || '').trim().toLowerCase();
        if (!isValidEmail(email)) return res.status(400).json({ msg: 'Invalid email' });

        const now = new Date();
        let record = await VerificationCode.findOne({ email, purpose: 'login' }).sort({ createdAt: -1 });
        if (record) {
            if (record.lockedUntil && record.lockedUntil > now) {
                const secs = Math.ceil((record.lockedUntil - now) / 1000);
                return res.status(429).json({ msg: 'Temporarily locked. Try later.', retryAfterSec: secs });
            }
            if (record.resendAvailableAt && record.resendAvailableAt > now) {
                const secs = Math.ceil((record.resendAvailableAt - now) / 1000);
                return res.status(429).json({ msg: 'Please wait before requesting another code.', retryAfterSec: secs });
            }
        }

        const code = genCode();
        const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
        const resendAvailableAt = new Date(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);

        await VerificationCode.findOneAndUpdate(
            { email, purpose: 'login' },
            { code, attempts: 0, maxAttempts: MAX_ATTEMPTS, lockedUntil: new Date(0), expiresAt, resendAvailableAt },
            { upsert: true }
        );

        const subject = 'Your Tart verification code';
        const text = `Your Tart verification code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes.`;
        const html = `<p>Your Tart verification code is <b>${code}</b>. It expires in ${OTP_TTL_MINUTES} minutes.</p>`;
        try {
            await sendEmail({ to: email, subject, text, html });
        } catch (e) {
            console.error('SES sendEmail error:', e);
            return res.status(500).json({ msg: 'Failed to send email' });
        }

        return res.json({ msg: 'Code sent' });
    } catch (err) {
        console.error('OTP request error:', err);
        return res.status(500).json({ msg: 'Server error' });
    }
});

// Email OTP: verify code
// @route   POST api/auth/otp/email/verify
// @access  Public
router.post('/otp/email/verify', async (req, res) => {
    try {
        const email = String((req.body && req.body.email) || '').trim().toLowerCase();
        const code = String((req.body && req.body.code) || '').trim();
        if (!isValidEmail(email) || !/^\d{6}$/.test(code)) return res.status(400).json({ msg: 'Invalid request' });

        const now = new Date();
        let record = await VerificationCode.findOne({ email, purpose: 'login' }).sort({ createdAt: -1 });
        if (!record || record.expiresAt <= now) {
            return res.status(400).json({ msg: 'Code expired. Request a new one.' });
        }
        if (record.lockedUntil && record.lockedUntil > now) {
            const secs = Math.ceil((record.lockedUntil - now) / 1000);
            return res.status(429).json({ msg: 'Temporarily locked. Try later.', retryAfterSec: secs });
        }

        if (record.code !== code) {
            record.attempts = (record.attempts || 0) + 1;
            if (record.attempts >= (record.maxAttempts || MAX_ATTEMPTS)) {
                record.lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15m lockout
            }
            await record.save();
            return res.status(400).json({ msg: 'Incorrect code' });
        }

        // Success: upsert artist, issue JWT
        let artist = await Artist.findOne({ email });
        if (!artist) {
            artist = new Artist({ name: email.split('@')[0], email });
            await artist.save();
            // Create default portfolio
            const portfolio = new Portfolio({ artist: artist.id });
            await portfolio.save();
            artist.portfolio = portfolio.id;
            await artist.save();
        }

        const payload = { artist: { id: artist.id } };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: 3600 });

        // Invalidate the used code
        await VerificationCode.deleteOne({ _id: record._id });

        return res.json({ token });
    } catch (err) {
        console.error('OTP verify error:', err);
        return res.status(500).json({ msg: 'Server error' });
    }
});

// Google OAuth routes
// @route GET api/auth/oauth/google
router.get('/oauth/google', (req, res, next) => {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        return res.status(503).json({ msg: 'Google OAuth not configured' });
    }
    passport.authenticate('google', { scope: ['profile', 'email'], session: false })(req, res, next);
});

// @route GET api/auth/oauth/google/callback
router.get('/oauth/google/callback', (req, res, next) => {
    passport.authenticate('google', { session: false }, async (err, artist, info) => {
        if (err) {
            console.error('Google OAuth error:', err);
            return res.redirect('/login.html?error=google');
        }
        if (!artist) return res.redirect('/login.html?error=google_no_user');

        const payload = { artist: { id: artist.id } };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: 3600 });

        const targetOrigin = process.env.OAUTH_POSTMESSAGE_ORIGIN || '*';
        const html = `<!doctype html><html><body><script>
            (function(){
                try {
                    if (window.opener && window.opener.postMessage) {
                        window.opener.postMessage({ type: 'oauthSuccess', provider: 'google', token: '${token}' }, '${targetOrigin}');
                    }
                } catch(e) {}
                window.close();
            })();
        </script>Success. You can close this window.</body></html>`;
        res.set('Content-Type', 'text/html');
        return res.send(html);
    })(req, res, next);
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
