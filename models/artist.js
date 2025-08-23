const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const artistSchema = new Schema({
    name: {
        type: String,
        required: true
    },
    city: {
        type: String,
        required: false
    },
    country: {
        type: String,
        required: false
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: false
    },
    googleId: {
        type: String,
        required: false,
        unique: false
    },
    portfolio: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Portfolio'
    },
    profilePictureUrl: {
        type: String,
        default: '/assets/default-avatar.svg'
    },
    profilePictureKey: {
        type: String,
        required: false
    },
    followers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Artist'
    }],
    following: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Artist'
    }],
    collections: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Artwork'
    }]
});

module.exports = mongoose.models.Artist || mongoose.model('Artist', artistSchema);
