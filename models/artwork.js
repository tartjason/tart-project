const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const artworkSchema = new Schema({
    title: {
        type: String,
        required: true
    },
    artist: {
        type: Schema.Types.ObjectId,
        ref: 'Artist',
        required: true
    },
    date: {
        type: Date,
        default: Date.now
    },
    description: {
        type: String,
        required: false,
        default: ''
    },
    medium: {
        type: String,
        // Keep 'furniture' for backward-compat; add 'industrial-design' going forward
        enum: ['poetry', 'painting', 'furniture', 'photography', 'industrial-design'],
        required: true
    },
    imageUrl: {
        type: String,
        required: function() {
            return this.medium !== 'poetry';
        }
    },
    imageKey: {
        type: String,
        required: false
    },
    // Deprecated: legacy poetry storage as positioned text
    poetryData: [{
        text: String,
        color: String,
        x: Number,
        y: Number
    }],
    location: {
        type: String
    },
    // New structured location fields (preferred going forward)
    locationCountry: { type: String },
    locationCity: { type: String },

    // Optional source of artwork
    source: { type: String, enum: ['human', 'ai'], required: false },

    // Optional 2D metrics (photography/painting)
    metrics2d: {
        width: { type: Number, min: 0 },
        height: { type: Number, min: 0 },
        units: { type: String, enum: ['cm', 'in', 'mm'] }
    },

    // Optional 3D metrics (industrial-design)
    metrics3d: {
        length: { type: Number, min: 0 },
        width: { type: Number, min: 0 },
        height: { type: Number, min: 0 },
        units: { type: String, enum: ['cm', 'in', 'mm'] }
    },

    // New poetry format: per-line rich HTML with style metadata
    poem: {
        lines: [{
            html: { type: String },
            color: { type: String },
            indent: { type: Number, min: 0 },
            spacing: { type: Number, min: 0 }
        }]
    },

    collectedBy: [{
        type: Schema.Types.ObjectId,
        ref: 'Artist'
    }],
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.models.Artwork || mongoose.model('Artwork', artworkSchema);
