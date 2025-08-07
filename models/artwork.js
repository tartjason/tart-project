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
        enum: ['poetry', 'painting', 'furniture', 'photography'],
        required: true
    },
    imageUrl: {
        type: String,
        required: function() {
            return this.medium !== 'poetry';
        }
    },
    poetryData: [{
        text: String,
        color: String,
        x: Number,
        y: Number
    }],
    location: {
        type: String
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
