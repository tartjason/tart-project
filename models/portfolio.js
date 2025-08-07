const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const portfolioSchema = new Schema({
    artist: {
        type: Schema.Types.ObjectId,
        ref: 'Artist',
        required: true,
        unique: true
    },
    artistStatement: {
        type: String,
        default: ''
    },
    layout: {
        type: String,
        enum: ['grid', 'masonry', 'full-screen'],
        default: 'grid'
    },
    colorPalette: {
        type: String,
        enum: ['light', 'dark', 'sepia'],
        default: 'light'
    },
    customUrl: {
        type: String,
        trim: true,
        unique: true,
        sparse: true // Allows multiple documents to have a null value for this field
    },
    artworks: [{
        type: Schema.Types.ObjectId,
        ref: 'Artwork'
    }]
});

module.exports = mongoose.models.Portfolio || mongoose.model('Portfolio', portfolioSchema);
