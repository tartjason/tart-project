const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Artist = require('../models/artist');
const Follow = require('../models/Follow');
const Artwork = require('../models/artwork');

// @route   PUT api/artists/:id/follow
// @desc    Follow or un-follow an artist
// @access  Private
router.put('/:id/follow', auth, async (req, res) => {
    try {
        const targetArtist = await Artist.findById(req.params.id);
        const currentUser = await Artist.findById(req.artist.id);

        if (!targetArtist) {
            return res.status(404).json({ msg: 'Artist not found' });
        }

        // Prevent user from following themselves
        if (targetArtist._id.toString() === currentUser._id.toString()) {
            return res.status(400).json({ msg: 'You cannot follow yourself' });
        }

        // Check if the user is already following the target artist
        const isFollowing = currentUser.following.includes(targetArtist._id);

        if (isFollowing) {
            // --- Un-follow the artist ---
            currentUser.following.pull(targetArtist._id);
            targetArtist.followers.pull(currentUser._id);
            // Remove follow document (ignore if not present)
            try { await Follow.deleteOne({ follower: currentUser._id, following: targetArtist._id }); } catch (_) {}
        } else {
            // --- Follow the artist ---
            currentUser.following.push(targetArtist._id);
            targetArtist.followers.push(currentUser._id);
            // Upsert follow document to record timestamp
            try {
                await Follow.updateOne(
                    { follower: currentUser._id, following: targetArtist._id },
                    { $setOnInsert: { follower: currentUser._id, following: targetArtist._id } },
                    { upsert: true }
                );
            } catch (e) {
                // ignore duplicate errors
                if (e && e.code !== 11000) console.warn('Follow upsert error:', e.message);
            }
        }

        await currentUser.save();
        await targetArtist.save();

        res.json(currentUser.following);

    } catch (err) {
        console.error(err.message);
        if (err.kind === 'ObjectId') {
            return res.status(404).json({ msg: 'Artist not found' });
        }
        res.status(500).send('Server Error');
    }
});

// @route   GET api/artists/:id
// @desc    Public profile data for any artist by ID
// @access  Public
router.get('/:id', async (req, res) => {
    try {
        const artist = await Artist.findById(req.params.id)
            .select('-password')
            .populate({
                path: 'collections',
                populate: {
                    path: 'artist',
                    select: 'name'
                }
            })
            .populate('followers', 'name profilePictureUrl')
            .populate('following', 'name profilePictureUrl');

        if (!artist) {
            return res.status(404).json({ msg: 'Artist not found' });
        }

        // Always fetch artworks; we may hide them based on privacy below.
        const artworks = await Artwork.find({ artist: req.params.id }).sort({ date: -1 });
        const artistObject = artist.toObject();

        // Attach artworks by default, then enforce visibility toggles.
        artistObject.artworks = artworks;

        // Enforce privacy: hide sections when respective flags are false.
        // Note: This endpoint is public; owners should use /api/auth/me which returns full data.
        if (artistObject && artistObject.followersVisible === false) {
            artistObject.followers = [];
        }
        if (artistObject && artistObject.followingVisible === false) {
            artistObject.following = [];
        }
        if (artistObject && artistObject.galleryVisible === false) {
            artistObject.artworks = [];
        }
        if (artistObject && artistObject.collectionVisible === false) {
            artistObject.collections = [];
        }

        return res.json(artistObject);
    } catch (err) {
        console.error(err.message);
        if (err && err.kind === 'ObjectId') {
            return res.status(404).json({ msg: 'Artist not found' });
        }
        return res.status(500).send('Server Error');
    }
});

module.exports = router;
