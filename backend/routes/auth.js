const express   = require('express');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const passport  = require('passport');
const router    = express.Router();
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');

const SALT_ROUNDS  = 12;
const TOKEN_EXPIRY = '7d';

// ─────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────
function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

function validateRegisterBody(body) {
  const { name, email, password, role } = body;
  const errors = [];
  if (!name  || name.trim().length < 2)          errors.push('name must be at least 2 characters');
  if (!email || !/\S+@\S+\.\S+/.test(email))     errors.push('a valid email is required');
  if (!password || password.length < 8)           errors.push('password must be at least 8 characters');
  if (role && !['supervisor', 'farmer', 'manager'].includes(role))
    errors.push("role must be 'supervisor', 'farmer', or 'manager'");
  return errors;
}

// ─────────────────────────────────────────────────────────────
//  POST /api/auth/register
// ─────────────────────────────────────────────────────────────
router.post('/register', async (req, res, next) => {
  try {
    const errors = validateRegisterBody(req.body);
    if (errors.length) return res.status(400).json({ errors });

    const { name, email, password, role = 'farmer' } = req.body;

    const existing = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length) return res.status(409).json({ error: 'Email already registered' });

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

    const { rows } = await query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role, created_at`,
      [name.trim(), email.toLowerCase(), password_hash, role]
    );

    const user  = rows[0];
    const token = signToken(user);

    return res.status(201).json({
      message: 'Registration successful',
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
//  POST /api/auth/login
// ─────────────────────────────────────────────────────────────
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'Email and password are required' });

    const { rows } = await query(
      'SELECT id, name, email, password_hash, role FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' });

    const user = rows[0];

    // Block Google-only accounts from password login
    if (user.password_hash?.startsWith('GOOGLE_OAUTH:')) {
      return res.status(400).json({ error: 'This account uses Google Sign-In. Please use "Continue with Google".' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signToken(user);
    return res.json({
      message: 'Login successful',
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
//  GET /api/auth/me
// ─────────────────────────────────────────────────────────────
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT id, name, email, role, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    return res.json({ user: rows[0] });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
//  GET /api/auth/google  →  Kick off Google OAuth flow
// ─────────────────────────────────────────────────────────────
router.get(
  '/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false,
  })
);

// ─────────────────────────────────────────────────────────────
//  GET /api/auth/google/callback  →  Google redirects here
//  Issues a JWT and redirects the browser to the frontend
//  callback page with the token in the URL query string.
// ─────────────────────────────────────────────────────────────
router.get(
  '/google/callback',
  passport.authenticate('google', {
    session: false,
    failureRedirect: `${process.env.FRONTEND_URL}/login?error=google_failed`,
  }),
  (req, res) => {
    // req.user is the DB row returned by the GoogleStrategy done() callback
    const user  = req.user;
    const token = signToken(user);

    const params = new URLSearchParams({
      token,
      id:    user.id,
      name:  user.name,
      email: user.email,
      role:  user.role,
    });

    // Redirect browser to the frontend OAuth landing page
    return res.redirect(`${process.env.FRONTEND_URL}/auth/callback?${params.toString()}`);
  }
);

// ─────────────────────────────────────────────────────────────
//  PATCH /api/auth/update-role
//  For Google OAuth users who registered with role='pending'.
//  Requires a valid JWT (even with pending role) so the user
//  is identified. Returns a NEW token with the updated role.
// ─────────────────────────────────────────────────────────────
router.patch('/update-role', authenticate, async (req, res, next) => {
  try {
    const { role } = req.body;
    const VALID_ROLES = ['farmer', 'supervisor', 'manager'];

    if (!role || !VALID_ROLES.includes(role)) {
      return res.status(400).json({
        error: `role must be one of: ${VALID_ROLES.join(', ')}`,
      });
    }

    // Only allow updating from 'pending' — prevents role self-escalation
    if (req.user.role !== 'pending') {
      return res.status(403).json({
        error: 'Role can only be set once during profile completion.',
      });
    }

    const { rows } = await query(
      `UPDATE users SET role = $1 WHERE id = $2
       RETURNING id, name, email, role`,
      [role, req.user.id]
    );

    if (!rows.length) return res.status(404).json({ error: 'User not found' });

    const updatedUser = rows[0];
    const newToken    = signToken(updatedUser);

    return res.json({
      message: 'Role updated successfully',
      token:   newToken,
      user:    { id: updatedUser.id, name: updatedUser.name, email: updatedUser.email, role: updatedUser.role },
    });
  } catch (err) { next(err); }
});

module.exports = router;

