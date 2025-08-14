const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const websiteStateSchema = new Schema({
    artist: {
        type: Schema.Types.ObjectId,
        ref: 'Artist',
        required: true,
        unique: true
    },
    
    // Survey data - core structure
    surveyData: {
        medium: String,
        features: {
            home: { type: Boolean, default: true },
            about: { type: Boolean, default: true },
            works: { type: Boolean, default: true },
            worksOrganization: { type: String, enum: ['year', 'theme'] },
            commission: { type: Boolean, default: false },
            exhibition: { type: Boolean, default: false }
        },
        layouts: {
            homepage: { type: String, enum: ['grid', 'split', 'hero'] },
            about: { type: String, enum: ['split', 'vertical'] },
            works: { type: String, enum: ['grid', 'single'] },
            commission: String,
            exhibition: String
        },
        worksDetails: {
            years: [Number],
            themes: [String]
        },
        aboutSections: {
            education: { type: Boolean, default: false },
            workExperience: { type: Boolean, default: false },
            recentlyFeatured: { type: Boolean, default: false },
            selectedExhibition: { type: Boolean, default: false },
            selectedPress: { type: Boolean, default: false },
            selectedAwards: { type: Boolean, default: false },
            selectedProjects: { type: Boolean, default: false },
            contactInfo: { type: Boolean, default: false }
        },
        logo: String,
        style: {
            fontSize: { type: Number, default: 16 },
            textColor: { type: String, default: '#333333' },
            themeColor: { type: String, default: '#007bff' }
        }
    },
    
    // Canonical editable content (path-based model)
    homeContent: {
        title: String,
        subtitle: String,
        description: String,
        explore_text: String,
        imageUrl: String
    },
    aboutContent: {
        title: String,
        bio: String, // rich text (HTML)
        imageUrl: String,
        // Additional HTML sections rendered on About page
        contactInfo: String,
        education: String,
        workExperience: String,
        recentlyFeatured: String,
        selectedExhibition: String,
        selectedPress: String,
        selectedAwards: String,
        selectedProjects: String
    },

    // Editable content for each page
    content: {
        homepage: {
            title: String,
            subtitle: String,
            description: String,
            heroText: String,
            customText: Schema.Types.Mixed // For any custom text edits
        },
        about: {
            title: String,
            biography: String,
            education: [String],
            workExperience: [String],
            exhibitions: [String],
            press: [String],
            awards: [String],
            projects: [String],
            contactInfo: {
                email: String,
                phone: String,
                address: String,
                website: String,
                social: Schema.Types.Mixed
            },
            customText: Schema.Types.Mixed
        },
        works: {
            title: String,
            description: String,
            selectedArtworks: [{
                type: Schema.Types.ObjectId,
                ref: 'Artwork'
            }],
            customText: Schema.Types.Mixed
        },
        commission: {
            title: String,
            description: String,
            process: [String],
            pricing: String,
            contactInfo: String,
            customText: Schema.Types.Mixed
        },
        exhibition: {
            title: String,
            description: String,
            upcomingExhibitions: [Schema.Types.Mixed],
            pastExhibitions: [Schema.Types.Mixed],
            customText: Schema.Types.Mixed
        }
    },
    
    // Custom CSS and styling overrides
    customStyles: {
        css: String,
        colorOverrides: Schema.Types.Mixed,
        fontOverrides: Schema.Types.Mixed,
        layoutOverrides: Schema.Types.Mixed
    },
    
    // Publication status
    isPublished: {
        type: Boolean,
        default: false
    },
    publishedUrl: String,
    
    // Compiled site data
    compiledJsonPath: String,
    compiledAt: Date,
    surveyCompleted: { type: Boolean, default: false },
    
    // Metadata
    lastModified: {
        type: Date,
        default: Date.now
    },
    version: {
        type: Number,
        default: 1
    }
}, {
    timestamps: true
});

// Update lastModified on save
websiteStateSchema.pre('save', function(next) {
    this.lastModified = new Date();
    next();
});

module.exports = mongoose.models.WebsiteState || mongoose.model('WebsiteState', websiteStateSchema);
