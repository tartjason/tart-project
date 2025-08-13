const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const WebsiteState = require('../models/WebsiteState');
const fs = require('fs');
const path = require('path');

// Debug middleware
router.use((req, res, next) => {
    console.log(`[WEBSITE_STATE] ${req.method} ${req.path} - ${req.originalUrl}`);
    next();
});

// Basic HTML sanitizer (avoid external deps). Strips <script> and inline event handlers.
function sanitizeHtmlBasic(input) {
    if (typeof input !== 'string') return input;
    let out = input.replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, '');
    // remove on*="..." attributes
    out = out.replace(/ on[a-zA-Z]+\s*=\s*"[^"]*"/g, '');
    out = out.replace(/ on[a-zA-Z]+\s*=\s*'[^']*'/g, '');
    out = out.replace(/ on[a-zA-Z]+\s*=\s*[^\s>]+/g, '');
    return out;
}

function setByPath(target, dotPath, value) {
    const parts = dotPath.split('.');
    let obj = target;
    for (let i = 0; i < parts.length - 1; i++) {
        const key = parts[i];
        if (obj[key] === undefined || obj[key] === null) obj[key] = {};
        obj = obj[key];
    }
    obj[parts[parts.length - 1]] = value;
}

function isAllowedPath(pathStr) {
    const allowed = new Set([
        'homeContent.title',
        'homeContent.subtitle',
        'homeContent.description',
        'homeContent.imageUrl',
        'aboutContent.title',
        'aboutContent.bio',
        'aboutContent.imageUrl'
    ]);
    return allowed.has(pathStr);
}

function validateTypeForPath(pathStr, type) {
    const htmlFields = new Set(['aboutContent.bio']);
    const imageFields = new Set(['homeContent.imageUrl', 'aboutContent.imageUrl']);
    if (htmlFields.has(pathStr)) return type === 'html';
    if (imageFields.has(pathStr)) return type === 'imageUrl' || type === 'text';
    return type === 'text';
}

// Helper: build medium-specific placeholder content (used for compiled JSON)
function buildMediumPlaceholders(medium) {
    const mediumData = {
        painting: {
            title: "Contemporary Painting Studio",
            subtitle: "Exploring color, form, and emotion through paint",
            description: "My paintings explore the intersection of color and emotion, creating vibrant compositions that speak to the human experience.",
            works: [
                { title: "Abstract Composition #1", year: "2024", cleanContent: "Oil on Canvas", morandiStyle: "background: #d9c7b7;", brightMorandiStyle: "background: #e8d7c7;" },
                { title: "Urban Landscape", year: "2024", cleanContent: "Acrylic on Board", morandiStyle: "background: #b8a082;", brightMorandiStyle: "background: #d4c4a8;" },
                { title: "Portrait Study", year: "2023", cleanContent: "Mixed Media", morandiStyle: "background: #c9b7a6;", brightMorandiStyle: "background: #e0d0c0;" }
            ],
            featured: { cleanContent: "Featured Painting", morandiStyle: "background: #d9c7b7;" },
            hero: { cleanContent: "Latest Work", morandiStyle: "background: #e8ddd4;" }
        },
        photography: {
            title: "Visual Storytelling",
            subtitle: "Capturing moments that matter",
            description: "Through my lens, I capture the beauty in everyday moments and the extraordinary in the ordinary.",
            works: [
                { title: "Street Photography Series", year: "2024", cleanContent: "Digital", morandiStyle: "background: #8a9a9a;", brightMorandiStyle: "background: #c0c8c8;" },
                { title: "Portrait Collection", year: "2024", cleanContent: "Film", morandiStyle: "background: #b5b5b5;", brightMorandiStyle: "background: #d0d0d0;" },
                { title: "Nature Studies", year: "2023", cleanContent: "Landscape", morandiStyle: "background: #a8b5a8;", brightMorandiStyle: "background: #c8d0c8;" }
            ],
            featured: { cleanContent: "Featured Photo", morandiStyle: "background: #8a9a9a;" },
            hero: { cleanContent: "Latest Shot", morandiStyle: "background: #9aa5aa;" }
        },
        poetry: {
            title: "Words & Verses",
            subtitle: "Poetry that speaks to the soul",
            description: "My poetry explores themes of love, loss, hope, and the human condition through carefully crafted verses.",
            works: [
                { title: "Midnight Reflections", year: "2024", cleanContent: "\"In the quiet hours...\"", morandiStyle: "background: #8a8a8a;", brightMorandiStyle: "background: #c0c0c0;" },
                { title: "Spring Awakening", year: "2024", cleanContent: "\"Petals fall like...\"", morandiStyle: "background: #a8b5c7;", brightMorandiStyle: "background: #d0d8e0;" },
                { title: "Urban Symphony", year: "2023", cleanContent: "\"City lights dance...\"", morandiStyle: "background: #c7b5a8;", brightMorandiStyle: "background: #e0d0c8;" }
            ],
            featured: { cleanContent: "Featured Poem", morandiStyle: "background: #b5a8c7;" },
            hero: { cleanContent: "Latest Verse", morandiStyle: "background: #c7a8b5;" }
        },
        furniture: {
            title: "Functional Art",
            subtitle: "Where design meets craftsmanship",
            description: "I create furniture pieces that blend functionality with artistic expression, using sustainable materials and traditional techniques.",
            works: [
                { title: "Modern Oak Table", year: "2024", cleanContent: "Handcrafted Oak", morandiStyle: "background: #c4a882;", brightMorandiStyle: "background: #e0c8a8;" },
                { title: "Minimalist Bookshelf", year: "2024", cleanContent: "Walnut & Steel", morandiStyle: "background: #a08270;", brightMorandiStyle: "background: #d0b8a0;" },
                { title: "Ergonomic Chair", year: "2023", cleanContent: "Sustainable Pine", morandiStyle: "background: #b5a082;", brightMorandiStyle: "background: #d8c8a8;" }
            ],
            featured: { cleanContent: "Featured Piece", morandiStyle: "background: #a89082;" },
            hero: { cleanContent: "Latest Creation", morandiStyle: "background: #c4b082;" }
        },
        'multi-medium': {
            title: "Mixed Media Art",
            subtitle: "Exploring creativity across mediums",
            description: "My work spans multiple mediums, combining traditional and contemporary techniques to create unique artistic expressions.",
            works: [
                { title: "Digital Collage", year: "2024", cleanContent: "Mixed Media", morandiStyle: "background: #a8a8c7;", brightMorandiStyle: "background: #d0d0e0;" },
                { title: "Sculptural Installation", year: "2024", cleanContent: "3D Art", morandiStyle: "background: #c7a8b5;", brightMorandiStyle: "background: #e0d0d8;" },
                { title: "Interactive Piece", year: "2023", cleanContent: "Performance", morandiStyle: "background: #a8c7c7;", brightMorandiStyle: "background: #d0e0e0;" }
            ],
            featured: { cleanContent: "Featured Work", morandiStyle: "background: #c7b5a8;" },
            hero: { cleanContent: "Latest Project", morandiStyle: "background: #b5c7a8;" }
        }
    };
    return mediumData[medium] || mediumData['multi-medium'];
}

// Helper: About example sections (mirrors public/js/exampleContent.js)
function buildAboutExampleSections() {
    return {
        education: `
      <p><strong>2023</strong> - BFA in Fine Arts, [University Name]</p>
      <p><strong>2021</strong> - Certificate in Traditional Painting Techniques, [Art School]</p>
    `,
        workExperience: `
      <p><strong>2023-Present</strong> - Freelance Artist</p>
      <p><strong>2022-2023</strong> - Gallery Assistant, [Gallery Name]</p>
    `,
        recentlyFeatured: `
      <p><strong>2024</strong> - Art Magazine Feature</p>
      <p><strong>2024</strong> - Online Gallery Spotlight</p>
    `,
        selectedExhibition: `
      <p><strong>2024</strong> - "Contemporary Visions" Group Show, [Gallery Name]</p>
      <p><strong>2023</strong> - "Emerging Artists" Solo Exhibition, [Gallery Name]</p>
    `,
        selectedPress: `
      <p><strong>2024</strong> - Featured in [Art Publication]</p>
      <p><strong>2023</strong> - Interview with [Magazine Name]</p>
    `,
        selectedAwards: `
      <p><strong>2024</strong> - Emerging Artist Grant</p>
      <p><strong>2023</strong> - Excellence in Fine Arts Award</p>
    `,
        selectedProjects: `
      <p><strong>2024</strong> - Community Mural Project</p>
      <p><strong>2023</strong> - Artist Talk at [Institution]</p>
    `,
        contactInfo: `
      <p>Email: <a href="mailto:artist@email.com" style="color: #333;">artist@email.com</a></p>
      <p>Phone: [Phone Number]</p>
      <p>Studio: [Address]</p>
    `
    };
}

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
        // Normalize incoming fields to match schema
        const normalized = { ...surveyData };
        // logo: allow object with { dataUrl } from frontend; store as string
        if (normalized && typeof normalized.logo === 'object' && normalized.logo !== null) {
            normalized.logo = normalized.logo.dataUrl || null;
        }
        // Layout about: ensure valid enum
        if (normalized.layouts && normalized.layouts.about) {
            const allowedAbout = new Set(['split', 'vertical']);
            if (!allowedAbout.has(normalized.layouts.about)) {
                delete normalized.layouts.about;
            }
        }
        
        let websiteState = await WebsiteState.findOne({ artist: req.artist.id });
        
        if (!websiteState) {
            websiteState = new WebsiteState({
                artist: req.artist.id,
                surveyData: normalized
            });
        } else {
            websiteState.surveyData = { ...websiteState.surveyData, ...normalized };
            websiteState.version += 1;
        }
        
        await websiteState.save();
        res.json(websiteState);
    } catch (error) {
        console.error('Error updating survey data:', error);
        res.status(500).json({ msg: 'Server error' });
    }
});
 
// @route   POST /api/website-state/compile
// @desc    Compile per-user site JSON and mark survey completed
// @access  Private
router.post('/compile', auth, async (req, res) => {
    try {
        let websiteState = await WebsiteState.findOne({ artist: req.artist.id });
        if (!websiteState) {
            return res.status(404).json({ msg: 'Website state not found' });
        }

        // Build compiled JSON from current state
        const surveyData = websiteState.surveyData || {};
        const medium = surveyData && surveyData.medium;
        const layout = (surveyData.layouts && surveyData.layouts.homepage) || 'grid';
        // Pull example data for the selected medium (kept in sync with public/js/exampleContent.js)
        const mediumData = buildMediumPlaceholders(medium);

        // Adaptive homeContent based on selected home layout
        let homeContent = {};
        if (layout === 'hero') {
            homeContent = {
                imageUrl: '',
                title: mediumData.title || '',
                subtitle: mediumData.subtitle || '',
                description: mediumData.description || ''
            };
        } else if (layout === 'split') {
            homeContent = {
                imageUrl: '',
                title: mediumData.title || '',
                description: mediumData.description || '',
                explore_text: `Explore my collection of ${medium || 'art'} works, each piece carefully crafted to capture the essence of light, color, and emotion.`
            };
        }
        // Merge persisted edits if present
        const persistedHome = websiteState.homeContent || {};
        homeContent = { ...homeContent, ...persistedHome };

        // Build aboutContent based on selected sections from survey and example content
        const aboutExample = buildAboutExampleSections();
        const aboutSectionsCfg = (surveyData.aboutSections) || {};
        const selectedAboutSections = {};
        Object.keys(aboutSectionsCfg).forEach((key) => {
            if (aboutSectionsCfg[key]) {
                selectedAboutSections[key] = aboutExample[key] || '';
            }
        });
        const baseAbout = {
            imageUrl: '',
            title: 'About Me',
            bio: 'I am an artist currently based in [Location]. My work has been exhibited in galleries and shows, and I continue to develop my practice through exploration of various mediums and techniques.',
            ...selectedAboutSections
        };
        const persistedAbout = websiteState.aboutContent || {};
        const aboutContent = { ...baseAbout, ...persistedAbout };

        const compiled = {
            surveyData: surveyData,
            content: websiteState.content || {},
            customStyles: websiteState.customStyles || {},
            homeContent,
            aboutContent,
            generatedAt: new Date().toISOString(),
            version: websiteState.version
        };

        // Ensure output directory exists under public
        const outDir = path.join(__dirname, '..', 'public', 'sites', String(req.artist.id));
        fs.mkdirSync(outDir, { recursive: true });
        const outFile = path.join(outDir, 'site.json');
        fs.writeFileSync(outFile, JSON.stringify(compiled, null, 2), 'utf8');

        // Update state with compiled path + flags
        websiteState.compiledJsonPath = `/sites/${req.artist.id}/site.json`;
        websiteState.compiledAt = new Date();
        websiteState.surveyCompleted = true;
        await websiteState.save();

        return res.json({ compiledJsonPath: websiteState.compiledJsonPath });
    } catch (error) {
        console.error('Error compiling site JSON:', error);
        return res.status(500).json({ msg: 'Server error' });
    }
});

// @route   POST /api/website-state/update-content-batch
// @desc    Batch update content by canonical JSON paths; optional compile
// @access  Private
router.post('/update-content-batch', auth, async (req, res) => {
    try {
        const { updates = [], version } = req.body || {};
        const doCompile = String(req.query.compile || 'false') === 'true';

        if (!Array.isArray(updates) || updates.length === 0) {
            return res.status(400).json({ msg: 'No updates provided' });
        }

        let websiteState = await WebsiteState.findOne({ artist: req.artist.id });
        if (!websiteState) {
            websiteState = new WebsiteState({ artist: req.artist.id });
        }

        // Optional optimistic concurrency
        if (typeof version === 'number' && websiteState.version !== version) {
            return res.status(409).json({ msg: 'Version conflict', serverVersion: websiteState.version });
        }

        for (const u of updates) {
            const { path: p, type, value } = u || {};
            if (!p || typeof p !== 'string') {
                return res.status(400).json({ msg: 'Invalid update path' });
            }
            if (p.includes('[')) {
                // Array index paths not yet supported in step 1
                return res.status(400).json({ msg: `Array index paths not supported yet: ${p}` });
            }
            if (!isAllowedPath(p)) {
                return res.status(400).json({ msg: `Path not allowed: ${p}` });
            }
            if (!validateTypeForPath(p, type)) {
                return res.status(400).json({ msg: `Invalid type for path ${p}` });
            }
            let v = value;
            if (type === 'html') v = sanitizeHtmlBasic(String(value ?? ''));

            // Determine root object (homeContent/aboutContent)
            if (p.startsWith('homeContent.')) {
                if (!websiteState.homeContent) websiteState.homeContent = {};
                setByPath(websiteState.homeContent, p.replace('homeContent.', ''), v);
            } else if (p.startsWith('aboutContent.')) {
                if (!websiteState.aboutContent) websiteState.aboutContent = {};
                setByPath(websiteState.aboutContent, p.replace('aboutContent.', ''), v);
            }
        }

        websiteState.version += 1;
        await websiteState.save();

        if (!doCompile) {
            return res.json({ version: websiteState.version });
        }

        // Build compiled JSON (reuse compile logic inline)
        const surveyData = websiteState.surveyData || {};
        const medium = surveyData && surveyData.medium;
        const layout = (surveyData.layouts && surveyData.layouts.homepage) || 'grid';
        const mediumData = buildMediumPlaceholders(medium);
        let homeContent = {};
        if (layout === 'hero') {
            homeContent = {
                imageUrl: '',
                title: mediumData.title || '',
                subtitle: mediumData.subtitle || '',
                description: mediumData.description || ''
            };
        } else if (layout === 'split') {
            homeContent = {
                imageUrl: '',
                title: mediumData.title || '',
                description: mediumData.description || '',
                explore_text: `Explore my collection of ${medium || 'art'} works, each piece carefully crafted to capture the essence of light, color, and emotion.`
            };
        }
        homeContent = { ...homeContent, ...(websiteState.homeContent || {}) };

        const aboutExample = buildAboutExampleSections();
        const aboutSectionsCfg = (surveyData.aboutSections) || {};
        const selectedAboutSections = {};
        Object.keys(aboutSectionsCfg).forEach((key) => {
            if (aboutSectionsCfg[key]) {
                selectedAboutSections[key] = aboutExample[key] || '';
            }
        });
        const baseAbout = {
            imageUrl: '',
            title: 'About Me',
            bio: 'I am an artist currently based in [Location]. My work has been exhibited in galleries and shows, and I continue to develop my practice through exploration of various mediums and techniques.',
            ...selectedAboutSections
        };
        const aboutContent = { ...baseAbout, ...(websiteState.aboutContent || {}) };

        const compiled = {
            surveyData: surveyData,
            content: websiteState.content || {},
            customStyles: websiteState.customStyles || {},
            homeContent,
            aboutContent,
            generatedAt: new Date().toISOString(),
            version: websiteState.version
        };

        const outDir = path.join(__dirname, '..', 'public', 'sites', String(req.artist.id));
        fs.mkdirSync(outDir, { recursive: true });
        const outFile = path.join(outDir, 'site.json');
        fs.writeFileSync(outFile, JSON.stringify(compiled, null, 2), 'utf8');

        websiteState.compiledJsonPath = `/sites/${req.artist.id}/site.json`;
        websiteState.compiledAt = new Date();
        websiteState.surveyCompleted = true;
        await websiteState.save();

        return res.json({ compiled, version: websiteState.version, compiledJsonPath: websiteState.compiledJsonPath });
    } catch (error) {
        console.error('Error updating content batch:', error);
        return res.status(500).json({ msg: 'Server error' });
    }
});

// @route   POST /api/website-state/start-over
// @desc    Delete compiled JSON and reset survey flags
// @access  Private
router.post('/start-over', auth, async (req, res) => {
    try {
        const websiteState = await WebsiteState.findOne({ artist: req.artist.id });
        if (!websiteState) {
            return res.status(404).json({ msg: 'Website state not found' });
        }

        // Delete compiled JSON file if it exists
        if (websiteState.compiledJsonPath) {
            try {
                const rel = websiteState.compiledJsonPath.startsWith('/')
                    ? websiteState.compiledJsonPath.slice(1)
                    : websiteState.compiledJsonPath;
                const fullPath = path.join(__dirname, '..', 'public', rel);
                if (fs.existsSync(fullPath)) {
                    fs.unlinkSync(fullPath);
                }
            } catch (e) {
                console.warn('Failed to delete compiled JSON:', e);
            }
        }

        // Reset flags so user returns to survey
        websiteState.compiledJsonPath = undefined;
        websiteState.compiledAt = undefined;
        websiteState.surveyCompleted = false;
        await websiteState.save();

        return res.json({ msg: 'Start over succeeded' });
    } catch (error) {
        console.error('Error starting over:', error);
        return res.status(500).json({ msg: 'Server error' });
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
