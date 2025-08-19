const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Portfolio = require('../models/portfolio');
const Artist = require('../models/artist');

// @route   POST api/portfolios
// @desc    Create or update an artist's portfolio
// @access  Private
router.post('/', auth, async (req, res) => {
    const { artistStatement, layout, colorPalette, customUrl } = req.body;

    const portfolioFields = {};
    portfolioFields.artist = req.artist.id;
    if (artistStatement) portfolioFields.artistStatement = artistStatement;
    if (layout) portfolioFields.layout = layout;
    if (colorPalette) portfolioFields.colorPalette = colorPalette;
    if (customUrl) portfolioFields.customUrl = customUrl;

    try {
        let portfolio = await Portfolio.findOne({ artist: req.artist.id });

        if (portfolio) {
            // Update
            portfolio = await Portfolio.findOneAndUpdate(
                { artist: req.artist.id },
                { $set: portfolioFields },
                { new: true }
            );
            return res.json({ portfolio });
        }

        // Create
        portfolio = new Portfolio(portfolioFields);
        await portfolio.save();

        // Link portfolio to artist
        await Artist.findByIdAndUpdate(req.artist.id, { portfolio: portfolio.id });

        res.json({ portfolio });
    } catch (err) {
        console.error(err.message);
        if (err.code === 11000) {
            return res.status(400).json({ msg: 'That custom URL is already taken.' });
        }
        res.status(500).send('Server Error');
    }
});

// @route   GET api/portfolios/:url
// @desc    Get portfolio by custom URL
// @access  Public
router.get('/:url', async (req, res) => {
    try {
        const portfolio = await Portfolio.findOne({ customUrl: req.params.url }).populate('artist', ['name']).populate('artworks');
        if (!portfolio) {
            return res.status(404).json({ msg: 'Portfolio not found' });
        }
        res.json(portfolio);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
