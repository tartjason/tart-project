const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Artist = require('../models/artist');

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
        } else {
            // --- Follow the artist ---
            currentUser.following.push(targetArtist._id);
            targetArtist.followers.push(currentUser._id);
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

module.exports = router;
