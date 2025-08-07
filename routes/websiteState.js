const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const WebsiteState = require('../models/WebsiteState');

// Debug middleware
router.use((req, res, next) => {
    console.log(`[WEBSITE_STATE] ${req.method} ${req.path} - ${req.originalUrl}`);
    next();
});

// @route   GET /api/website-state
// @desc    Get user's website state
// @access  Private
router.get('/', auth, async (req, res) => {
    try {
        let websiteState = await WebsiteState.findOne({ artist: req.artist.id })
            .populate('content.works.selectedArtworks');
        
        if (!websiteState) {
            // Create default website state if none exists
            websiteState = new WebsiteState({
                artist: req.artist.id,
                surveyData: {
                    medium: null,
                    features: {
                        home: true,
                        about: true,
                        works: true,
                        worksOrganization: null,
                        commission: false,
                        exhibition: false
                    },
                    layouts: {},
                    worksDetails: {
                        years: [],
                        themes: []
                    },
                    aboutSections: {},
                    logo: null,
                    style: {
                        fontSize: 16,
                        textColor: '#333333',
                        themeColor: '#007bff'
                    }
                },
                content: {
                    homepage: {},
                    about: {},
                    works: { selectedArtworks: [] },
                    commission: {},
                    exhibition: {}
                },
                customStyles: {},
                isPublished: false
            });
            
            await websiteState.save();
        }
        
        res.json(websiteState);
    } catch (error) {
        console.error('Error fetching website state:', error);
        res.status(500).json({ msg: 'Server error' });
    }
});

// @route   PUT /api/website-state
// @desc    Update user's website state
// @access  Private
router.put('/', auth, async (req, res) => {
    try {
        const updateData = req.body;
        
        let websiteState = await WebsiteState.findOne({ artist: req.artist.id });
        
        if (!websiteState) {
            // Create new if doesn't exist
            websiteState = new WebsiteState({
                artist: req.artist.id,
                ...updateData
            });
        } else {
            // Deep merge the update data
            websiteState = Object.assign(websiteState, updateData);
            websiteState.version += 1;
        }
        
        await websiteState.save();
        
        // Populate and return updated state
        await websiteState.populate('content.works.selectedArtworks');
        
        res.json(websiteState);
    } catch (error) {
        console.error('Error updating website state:', error);
        res.status(500).json({ msg: 'Server error' });
    }
});

// @route   PATCH /api/website-state/survey
// @desc    Update only survey data
// @access  Private
router.patch('/survey', auth, async (req, res) => {
    try {
        const surveyData = req.body;
        
        let websiteState = await WebsiteState.findOne({ artist: req.artist.id });
        
        if (!websiteState) {
            websiteState = new WebsiteState({
                artist: req.artist.id,
                surveyData
            });
        } else {
            websiteState.surveyData = { ...websiteState.surveyData, ...surveyData };
            websiteState.version += 1;
        }
        
        await websiteState.save();
        res.json(websiteState);
    } catch (error) {
        console.error('Error updating survey data:', error);
        res.status(500).json({ msg: 'Server error' });
    }
});

// @route   PATCH /api/website-state/content/:section
// @desc    Update content for a specific section
// @access  Private
router.patch('/content/:section', auth, async (req, res) => {
    try {
        const { section } = req.params;
        const contentData = req.body;
        
        const validSections = ['homepage', 'about', 'works', 'commission', 'exhibition'];
        if (!validSections.includes(section)) {
            return res.status(400).json({ msg: 'Invalid section' });
        }
        
        let websiteState = await WebsiteState.findOne({ artist: req.artist.id });
        
        if (!websiteState) {
            websiteState = new WebsiteState({
                artist: req.artist.id,
                content: { [section]: contentData }
            });
        } else {
            if (!websiteState.content) websiteState.content = {};
            websiteState.content[section] = { ...websiteState.content[section], ...contentData };
            websiteState.version += 1;
        }
        
        await websiteState.save();
        await websiteState.populate('content.works.selectedArtworks');
        
        res.json(websiteState);
    } catch (error) {
        console.error('Error updating content:', error);
        res.status(500).json({ msg: 'Server error' });
    }
});

// @route   PATCH /api/website-state/styles
// @desc    Update custom styles
// @access  Private
router.patch('/styles', auth, async (req, res) => {
    try {
        const stylesData = req.body;
        
        let websiteState = await WebsiteState.findOne({ artist: req.artist.id });
        
        if (!websiteState) {
            websiteState = new WebsiteState({
                artist: req.artist.id,
                customStyles: stylesData
            });
        } else {
            websiteState.customStyles = { ...websiteState.customStyles, ...stylesData };
            websiteState.version += 1;
        }
        
        await websiteState.save();
        res.json(websiteState);
    } catch (error) {
        console.error('Error updating styles:', error);
        res.status(500).json({ msg: 'Server error' });
    }
});

// @route   POST /api/website-state/publish
// @desc    Publish the website
// @access  Private
router.post('/publish', auth, async (req, res) => {
    try {
        const { customUrl } = req.body;
        
        let websiteState = await WebsiteState.findOne({ artist: req.artist.id });
        
        if (!websiteState) {
            return res.status(404).json({ msg: 'Website state not found' });
        }
        
        websiteState.isPublished = true;
        if (customUrl) {
            websiteState.publishedUrl = customUrl;
        }
        
        await websiteState.save();
        res.json(websiteState);
    } catch (error) {
        console.error('Error publishing website:', error);
        res.status(500).json({ msg: 'Server error' });
    }
});

// @route   DELETE /api/website-state
// @desc    Delete user's website state
// @access  Private
router.delete('/', auth, async (req, res) => {
    try {
        await WebsiteState.findOneAndDelete({ artist: req.artist.id });
        res.json({ msg: 'Website state deleted successfully' });
    } catch (error) {
        console.error('Error deleting website state:', error);
        res.status(500).json({ msg: 'Server error' });
    }
});

module.exports = router;
