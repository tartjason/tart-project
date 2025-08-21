const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const Artist = require('../models/artist');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL || '/api/auth/oauth/google/callback';

if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID:     GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    callbackURL:  GOOGLE_CALLBACK_URL
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const email = (profile.emails && profile.emails[0] && profile.emails[0].value) || undefined;
      const displayName = profile.displayName || (email ? email.split('@')[0] : 'Artist');
      let artist = null;

      if (profile.id) {
        artist = await Artist.findOne({ googleId: profile.id });
      }
      if (!artist && email) {
        artist = await Artist.findOne({ email });
      }
      if (!artist) {
        artist = new Artist({
          name: displayName,
          email: email || `unknown-${profile.id || Date.now()}@example.com`,
          googleId: profile.id
        });
      } else {
        // Update missing fields
        if (!artist.googleId && profile.id) artist.googleId = profile.id;
        if (!artist.name && displayName) artist.name = displayName;
        if (email && !artist.email) artist.email = email;
      }

      await artist.save();
      return done(null, artist);
    } catch (err) {
      return done(err);
    }
  }));
} else {
  console.warn('[Auth] Google OAuth env not fully configured; GoogleStrategy not enabled');
}

module.exports = passport;
