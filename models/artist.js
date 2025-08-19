const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const artistSchema = new Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
    portfolio: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Portfolio'
    },
    profilePictureUrl: {
        type: String,
        default: '/assets/default-avatar.png'
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
