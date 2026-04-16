require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const helmet   = require('helmet');
const morgan   = require('morgan');
const passport = require('./config/passport'); // initialises the Google Strategy

// ── Route imports ────────────────────────────────────────────
const authRoutes    = require('./routes/auth');
const farmRoutes    = require('./routes/farms');
const farmersRoutes = require('./routes/farmers');
const sarvamRoutes  = require('./routes/sarvam');


const app  = express();
const PORT = process.env.PORT || 3000;

// ── Global middleware ─────────────────────────────────────────
app.use(helmet({
  // Allow the OAuth redirect without CSP blocking
  contentSecurityPolicy: false,
}));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Passport (stateless — no session needed for JWT flow) ────
app.use(passport.initialize());

// ── Health check ─────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── API routes ────────────────────────────────────────────────
app.use('/api/auth',    authRoutes);
app.use('/api/farms',   farmRoutes);
app.use('/api/farmers', farmersRoutes);
app.use('/api/sarvam',  sarvamRoutes);


// ── 404 handler ───────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── Global error handler ──────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
  });
});

// ── Start server ──────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🌱 AgriSense backend running on http://localhost:${PORT}`);
});

module.exports = app;
