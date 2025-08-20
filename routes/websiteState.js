// Helper: sanitize worksSelections payload
// Expected format: { [folderKey: string]: Array< { _id?: string, title?: string, imageUrl?: string } | string > }
function sanitizeWorksSelections(input) {
    const out = {};
    if (!input || typeof input !== 'object') return out;
    const keys = Object.keys(input);
    for (const k of keys) {
        out[k] = sanitizeArtworkArray(input[k]);
    }
    return out;
}

// Helper: normalize a single artwork item or id
function sanitizeArtworkItem(item) {
    if (item && typeof item === 'object') {
        const cleaned = {};
        if (typeof item._id === 'string') cleaned._id = item._id;
        if (typeof item.title === 'string') cleaned.title = item.title;
        if (typeof item.imageUrl === 'string') cleaned.imageUrl = item.imageUrl;
        return cleaned;
    } else if (typeof item === 'string') {
        return { _id: item };
    }
    return null;
}

// Helper: sanitize array of artworks or ids (for homeSelections)
function sanitizeArtworkArray(input) {
    const out = [];
    const arr = Array.isArray(input) ? input : [];
    for (const item of arr) {
        const cleaned = sanitizeArtworkItem(item);
        if (cleaned) out.push(cleaned);
        if (out.length >= 200) break; // guardrail overall
    }
    return out;
}

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const WebsiteState = require('../models/WebsiteState');
const { putJson, getSitesKey, deleteObject } = require('../utils/s3');
const jwt = require('jsonwebtoken');

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
        'homeContent.explore_text',
        'homeContent.imageUrl',
        'aboutContent.title',
        'aboutContent.bio',
        'aboutContent.contactInfo',
        'aboutContent.education',
        'aboutContent.workExperience',
        'aboutContent.recentlyFeatured',
        'aboutContent.selectedExhibition',
        'aboutContent.selectedPress',
        'aboutContent.selectedAwards',
        'aboutContent.selectedProjects',
        'aboutContent.imageUrl',
        // Works selections persistence (per subpage mapping)
        'surveyData.worksSelections',
        // Home selections persistence (homepage grid)
        'surveyData.homeSelections'
    ]);
    return allowed.has(pathStr);
}

function validateTypeForPath(pathStr, type) {
    const htmlFields = new Set([
        'aboutContent.bio',
        'aboutContent.contactInfo',
        'aboutContent.education',
        'aboutContent.workExperience',
        'aboutContent.recentlyFeatured',
        'aboutContent.selectedExhibition',
        'aboutContent.selectedPress',
        'aboutContent.selectedAwards',
        'aboutContent.selectedProjects'
    ]);
    const imageFields = new Set(['homeContent.imageUrl', 'aboutContent.imageUrl']);
    const jsonFields = new Set(['surveyData.worksSelections', 'surveyData.homeSelections']);
    if (htmlFields.has(pathStr)) return type === 'html';
    if (imageFields.has(pathStr)) return type === 'imageUrl' || type === 'text';
    if (jsonFields.has(pathStr)) return type === 'json';
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

// Helper: Build homeContent defaults by layout and merge with persisted, with guards
function buildHomeContent(layout, mediumData, persistedHome = {}) {
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
            // Medium-friendly copy; falls back to generic if missing
            explore_text: `Explore my collection of ${(mediumData && mediumData.title ? mediumData.title.toLowerCase() : 'art')} works, each piece carefully crafted to capture the essence of light, color, and emotion.`
        };
    } else {
        // Defaults for other layouts (e.g., grid)
        homeContent = {
            imageUrl: '',
            title: mediumData.title || '',
            subtitle: mediumData.subtitle || '',
            description: mediumData.description || ''
        };
    }
    // Clean undefined values from persisted so they don't wipe defaults in JSON.stringify
    const cleanedPersisted = {};
    for (const [k, v] of Object.entries(persistedHome || {})) {
        if (v !== undefined) cleanedPersisted[k] = v;
    }
    // Merge persisted edits if present
    homeContent = { ...homeContent, ...cleanedPersisted };
    // Enforce per-key defaults (undefined should fall back)
    const expectedKeys = layout === 'split'
        ? ['imageUrl', 'title', 'description', 'explore_text']
        : ['imageUrl', 'title', 'subtitle', 'description'];
    for (const key of expectedKeys) {
        if (homeContent[key] === undefined) {
            if (key === 'imageUrl') homeContent[key] = '';
            else if (key === 'explore_text') {
                homeContent[key] = `Explore my collection of ${(mediumData && mediumData.title ? mediumData.title.toLowerCase() : 'art')} works, each piece carefully crafted to capture the essence of light, color, and emotion.`;
            } else {
                homeContent[key] = mediumData[key] || '';
            }
        }
    }
    // Guard against accidental empty object (e.g., all keys undefined and filtered out)
    if (!homeContent || Object.keys(homeContent).length === 0) {
        homeContent = {
            imageUrl: '',
            title: mediumData.title || '',
            subtitle: mediumData.subtitle || '',
            description: mediumData.description || ''
        };
    }
    return homeContent;
}

// Helper: Build aboutContent from survey selections + defaults + persisted, with guards
function buildAboutContent(surveyData = {}, persistedAbout = {}) {
    const aboutExample = buildAboutExampleSections();
    const aboutSectionsCfg = surveyData.aboutSections || {};
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
    // Clean undefined values so they don't wipe defaults in JSON.stringify
    const cleanedPersisted = {};
    for (const [k, v] of Object.entries(persistedAbout || {})) {
        if (v !== undefined) cleanedPersisted[k] = v;
    }
    let aboutContent = { ...baseAbout, ...cleanedPersisted };
    // Guard + fill missing top-level fields
    if (!aboutContent || Object.keys(aboutContent).length === 0) {
        aboutContent = { imageUrl: '', title: 'About Me', bio: baseAbout.bio };
    } else {
        if (aboutContent.title == null) aboutContent.title = 'About Me';
        if (aboutContent.bio == null) aboutContent.bio = baseAbout.bio;
        if (aboutContent.imageUrl == null) aboutContent.imageUrl = '';
    }
    return aboutContent;
}

// Helper: Build compiled object from WebsiteState
function buildCompiledFromState(websiteState) {
    const surveyData = websiteState.surveyData || {};
    const medium = surveyData && surveyData.medium;
    const layout = (surveyData.layouts && surveyData.layouts.homepage) || 'grid';
    const mediumData = buildMediumPlaceholders(medium);

    const homeContent = buildHomeContent(layout, mediumData, websiteState.homeContent || {});
    const aboutContent = buildAboutContent(surveyData, websiteState.aboutContent || {});

    // Ensure worksSelections exists in compiled surveyData (default to empty object)
    if (!surveyData.worksSelections || typeof surveyData.worksSelections !== 'object') {
        surveyData.worksSelections = {};
    }
    // Ensure homeSelections exists in compiled surveyData (default to empty array)
    if (!Array.isArray(surveyData.homeSelections)) {
        surveyData.homeSelections = [];
    }

    // Mirror homeSelections into compiled.homeContent when homepage layout is grid
    if (layout === 'grid') {
        try {
            homeContent.homeSelections = Array.isArray(surveyData.homeSelections) ? surveyData.homeSelections : [];
        } catch {}
    }

    try {
        console.log('[COMPILE] layout=', layout, 'home keys=', Object.keys(homeContent), 'about keys=', Object.keys(aboutContent));
    } catch {}

    return {
        surveyData,
        content: websiteState.content || {},
        customStyles: websiteState.customStyles || {},
        homeContent,
        aboutContent,
        generatedAt: new Date().toISOString(),
        version: websiteState.version
    };
}

// Helper: Write compiled JSON to disk under public/sites/<artistId>/site.json
async function writeCompiledJson(artistId, compiled) {
    const Bucket = process.env.S3_BUCKET;
    if (!Bucket) throw new Error('S3_BUCKET env is required');
    const Key = getSitesKey(artistId);
    await putJson({ Bucket, Key, Body: JSON.stringify(compiled, null, 2), ContentType: 'application/json' });
    return `s3://${Bucket}/${Key}`;
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
        // Sanitize worksSelections mapping if provided
        if (normalized && normalized.worksSelections) {
            normalized.worksSelections = sanitizeWorksSelections(normalized.worksSelections);
        }
        if (!normalized.worksSelections) normalized.worksSelections = {};
        // Sanitize homeSelections (ordered array) if provided
        if (normalized && normalized.homeSelections) {
            normalized.homeSelections = sanitizeArtworkArray(normalized.homeSelections);
        }
        if (!Array.isArray(normalized.homeSelections)) normalized.homeSelections = [];
        
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
        // Build compiled JSON from current state using shared helpers
        const compiled = buildCompiledFromState(websiteState);

        // Write compiled JSON to S3
        await writeCompiledJson(req.artist.id, compiled);

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
            if (p === 'surveyData.worksSelections') {
                v = sanitizeWorksSelections(value);
            }
            if (p === 'surveyData.homeSelections') {
                v = sanitizeArtworkArray(value);
            }

            // Determine root object (homeContent/aboutContent)
            if (p.startsWith('homeContent.')) {
                if (!websiteState.homeContent) websiteState.homeContent = {};
                setByPath(websiteState.homeContent, p.replace('homeContent.', ''), v);
            } else if (p.startsWith('aboutContent.')) {
                if (!websiteState.aboutContent) websiteState.aboutContent = {};
                setByPath(websiteState.aboutContent, p.replace('aboutContent.', ''), v);
            } else if (p.startsWith('surveyData.')) {
                if (!websiteState.surveyData) websiteState.surveyData = {};
                const key = p.replace('surveyData.', '');
                if (key === 'worksSelections') {
                    websiteState.surveyData.worksSelections = v && typeof v === 'object' ? v : {};
                } else if (key === 'homeSelections') {
                    websiteState.surveyData.homeSelections = Array.isArray(v) ? v : [];
                } else {
                    setByPath(websiteState.surveyData, key, v);
                }
            }
        }

        websiteState.version += 1;
        await websiteState.save();

        if (!doCompile) {
            return res.json({ version: websiteState.version });
        }

        // Build compiled JSON using shared helpers
        const compiled = buildCompiledFromState(websiteState);

        // Write compiled JSON to S3
        await writeCompiledJson(req.artist.id, compiled);

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

        // Delete compiled JSON object from S3 if it exists
        if (websiteState.compiledJsonPath) {
            try {
                const Bucket = process.env.S3_BUCKET;
                if (Bucket) {
                    const Key = getSitesKey(req.artist.id);
                    await deleteObject({ Bucket, Key });
                }
            } catch (e) {
                console.warn('Failed to delete compiled JSON from S3:', e);
            }
        }

        // Reset flags so user returns to survey
        websiteState.compiledJsonPath = undefined;
        websiteState.compiledAt = undefined;
        websiteState.surveyCompleted = false;

        // Also clear any persisted editable content so a fresh start doesn't reuse prior values
        // Note: keep other fields (e.g., artworks) intact unless explicitly part of Start Over.
        websiteState.homeContent = {};
        websiteState.aboutContent = {};
        // Reset optimistic concurrency version to 0 so the first compile after Start Over is version 1
        websiteState.version = 0;
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
        let { customUrl } = req.body;

        let websiteState = await WebsiteState.findOne({ artist: req.artist.id });

        if (!websiteState) {
            return res.status(404).json({ msg: 'Website state not found' });
        }

        // Sanitize and validate slug
        if (typeof customUrl === 'string') {
            customUrl = customUrl.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-+/, '').replace(/-+$/, '');
        }
        if (!customUrl || customUrl.length < 3 || customUrl.length > 30 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])$/.test(customUrl)) {
            return res.status(400).json({ msg: 'Invalid slug' });
        }

        // Ensure uniqueness across other artists
        const conflict = await WebsiteState.findOne({ publishedUrl: customUrl, artist: { $ne: req.artist.id } }).select('_id').lean();
        if (conflict) {
            return res.status(409).json({ msg: 'Slug already taken' });
        }

        websiteState.isPublished = true;
        websiteState.publishedUrl = customUrl;

        await websiteState.save();
        res.json(websiteState);
    } catch (error) {
        console.error('Error publishing website:', error);
        res.status(500).json({ msg: 'Server error' });
    }
});

// @route   GET /api/website-state/slug-available
// @desc    Validate and check if a slug is available (not used by another artist)
// @access  Private
router.get('/slug-available', async (req, res) => {
    try {
        let slug = String(req.query.slug || '').toLowerCase();
        // Sanitize similarly to frontend
        slug = slug.replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-+/, '').replace(/-+$/, '');

        // Validate constraints
        if (!slug || slug.length < 3 || slug.length > 30 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])$/.test(slug)) {
            return res.json({ slug, available: false, reason: 'invalid' });
        }

        // Optional identification of caller (no auth required)
        let artistId = null;
        const token = req.header('x-auth-token');
        if (token) {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-insecure-secret');
                if (decoded && decoded.artist) {
                    artistId = typeof decoded.artist === 'object' ? (decoded.artist.id || decoded.artist._id) : decoded.artist;
                }
            } catch (e) {
                // ignore invalid token; treat as unauthenticated for availability
            }
        }

        // If another user's WebsiteState already has this slug, it's taken
        const existing = await WebsiteState.findOne({ publishedUrl: slug }).select('artist publishedUrl').lean();
        if (!existing) {
            return res.json({ slug, available: true });
        }
        // If it's the current user's own slug, treat as available
        const sameOwner = artistId && String(existing.artist) === String(artistId);
        return res.json({ slug, available: sameOwner, reason: sameOwner ? 'own' : 'taken' });
    } catch (error) {
        console.error('Error checking slug availability:', error);
        return res.status(500).json({ msg: 'Server error' });
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
