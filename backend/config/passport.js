const passport        = require('passport');
const GoogleStrategy  = require('passport-google-oauth20').Strategy;
const { query }       = require('../db');

/**
 * Google OAuth 2.0 Strategy
 *
 * New user  → inserted with role = 'pending'
 *             Frontend /complete-profile page lets them choose their real role.
 *
 * Returning user → returned as-is (role already set).
 */
passport.use(
  new GoogleStrategy(
    {
      clientID:     process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL:  process.env.GOOGLE_CALLBACK_URL,
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email    = profile.emails?.[0]?.value?.toLowerCase();
        const name     = profile.displayName || profile.name?.givenName || 'Google User';
        const googleId = profile.id;

        if (!email) {
          return done(new Error('No email returned from Google'), null);
        }

        // ── Returning user ────────────────────────────────────
        const existing = await query(
          'SELECT id, name, email, role FROM users WHERE email = $1',
          [email]
        );
        if (existing.rows.length) {
          return done(null, existing.rows[0]);
        }

        // ── New user — role = 'pending' until they complete profile ──
        const { rows } = await query(
          `INSERT INTO users (name, email, password_hash, role)
           VALUES ($1, $2, $3, $4)
           RETURNING id, name, email, role`,
          [name, email, `GOOGLE_OAUTH:${googleId}`, 'pending']
        );

        return done(null, rows[0]);
      } catch (err) {
        return done(err, null);
      }
    }
  )
);

// Stateless JWT flow — no session serialisation needed
passport.serializeUser((user, done)   => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

module.exports = passport;
