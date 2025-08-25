const express = require('express');
const router = express.Router();
const WebsiteState = require('../models/WebsiteState');

// Resolve a public site by slug
// GET /api/public/site?slug=<slug>
router.get('/site', async (req, res) => {
  try {
    let slug = String(req.query.slug || '').toLowerCase();
    // Sanitize similar to other endpoints
    slug = slug.replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-+/, '').replace(/-+$/, '');

    if (!slug || slug.length < 3 || slug.length > 30 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])$/.test(slug)) {
      return res.status(400).json({ msg: 'Invalid slug' });
    }

    const state = await WebsiteState.findOne({ publishedUrl: slug }).select('artist compiledJsonPath isPublished').lean();
    if (!state || !state.isPublished) {
      return res.status(404).json({ msg: 'Site not found' });
    }

    return res.json({ artistId: String(state.artist), compiledJsonPath: state.compiledJsonPath || null });
  } catch (err) {
    console.error('Error resolving public site:', err);
    return res.status(500).json({ msg: 'Server error' });
  }
});

// Resolve a public site by artistId (no auth)
// GET /api/public/site-by-artist/:id
router.get('/site-by-artist/:id', async (req, res) => {
  try {
    const artistId = String(req.params.id || '').trim();
    if (!artistId) {
      return res.status(400).json({ msg: 'Artist id required' });
    }

    const state = await WebsiteState.findOne({ artist: artistId })
      .select('artist publishedUrl compiledJsonPath isPublished')
      .lean();

    if (!state || !state.isPublished) {
      return res.status(404).json({ msg: 'Site not found' });
    }

    return res.json({
      artistId: String(state.artist),
      slug: state.publishedUrl || null,
      compiledJsonPath: state.compiledJsonPath || null,
      isPublished: !!state.isPublished,
    });
  } catch (err) {
    console.error('Error resolving public site by artist:', err);
    return res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
