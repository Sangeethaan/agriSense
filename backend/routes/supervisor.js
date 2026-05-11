const express             = require('express');
const crypto              = require('crypto');
const router              = express.Router();
const { query }           = require('../db');
const { authenticate }    = require('../middleware/auth');
const roleGuard           = require('../middleware/roleGuard');
const { sendFarmerInvite } = require('../services/emailService');

const guard     = [authenticate, roleGuard('supervisor', 'manager')];
const supGuard  = [authenticate, roleGuard('supervisor')];

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/supervisor/stats
//  Lightweight metrics for the Supervisor Dashboard header cards.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/stats', guard, async (req, res, next) => {
  try {
    const supId = req.user.id;
    const [farmsResult, visitsResult, farmersResult, recentVisitsResult] =
      await Promise.all([
        // Total farm plots for MY farmers
        query(`
          SELECT COUNT(f.id) AS count
          FROM   farms f
          JOIN   users u ON u.id = f.farmer_id
          WHERE  u.supervisor_id = $1
        `, [supId]),

        // Visits this week across MY farmers' farms
        query(`
          SELECT COUNT(v.id) AS count
          FROM   visits v
          JOIN   farms  f ON f.id = v.farm_id
          JOIN   users  u ON u.id = f.farmer_id
          WHERE  u.supervisor_id = $1
            AND  v.visit_date >= date_trunc('week', CURRENT_DATE)
        `, [supId]),

        // My farmers
        query(`SELECT COUNT(*) AS count FROM users WHERE role = 'farmer' AND supervisor_id = $1`, [supId]),

        // Visits in the last 30 days across MY farmers
        query(`
          SELECT COUNT(v.id) AS count
          FROM   visits v
          JOIN   farms  f ON f.id = v.farm_id
          JOIN   users  u ON u.id = f.farmer_id
          WHERE  u.supervisor_id = $1
            AND  v.visit_date >= CURRENT_DATE - INTERVAL '30 days'
        `, [supId]),
      ]);

    return res.json({
      total_farms:    parseInt(farmsResult.rows[0].count, 10),
      active_visits:  parseInt(visitsResult.rows[0].count, 10),
      total_farmers:  parseInt(farmersResult.rows[0].count, 10),
      monthly_visits: parseInt(recentVisitsResult.rows[0].count, 10),
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/supervisor/recent-visits
//  Last 5 visits across all farms, joined with farm and farmer details.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/recent-visits', guard, async (req, res, next) => {
  try {
    const result = await query(`
      SELECT
        v.id,
        v.visit_date,
        v.created_at,
        v.category,
        v.notes,
        v.supervisor_notes,
        f.id          AS farm_id,
        f.name        AS farm_name,
        u.id          AS farmer_id,
        u.name        AS farmer_name,
        t.full_text   AS transcript_snippet
      FROM   visits v
      JOIN   farms  f ON f.id = v.farm_id
      JOIN   users  u ON u.id = f.farmer_id
      LEFT JOIN transcripts t ON t.visit_id = v.id
      ORDER  BY v.created_at DESC
      LIMIT  5
    `);
    return res.json({ visits: result.rows });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/supervisor/farmers
//  All farmers registered in the system, with their farm count.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/farmers', guard, async (req, res, next) => {
  try {
    const supId = req.user.id;
    const { rows } = await query(`
      SELECT DISTINCT
        u.id,
        u.name,
        u.email,
        u.village,
        u.phone,
        u.status,
        u.created_at,
        COUNT(f.id) OVER (PARTITION BY u.id) AS farm_count
      FROM users u
      LEFT JOIN farms f ON f.farmer_id = u.id
      WHERE u.role = 'farmer'
        AND u.supervisor_id = $1
      ORDER BY u.name ASC
    `, [supId]);
    return res.json({ farmers: rows });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/supervisor/invite-farmer
//  Supervisor creates a pending farmer account and sends an invite email.
//  Body: { name, email, phone?, village? }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/invite-farmer', supGuard, async (req, res, next) => {
  try {
    const { name, email, phone = null, village = null } = req.body;
    if (!name?.trim() || !email?.trim()) {
      return res.status(400).json({ error: 'name and email are required' });
    }

    const normalEmail = email.toLowerCase().trim();

    // Check if already registered
    const existing = await query(
      `SELECT id, status FROM users WHERE email = $1`,
      [normalEmail]
    );
    if (existing.rows.length) {
      return res.status(409).json({ error: 'A user with this email already exists.' });
    }

    // Generate a secure one-time token
    const token     = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

    // Insert pending farmer
    const { rows } = await query(
      `INSERT INTO users
         (name, email, password_hash, role, supervisor_id, invite_token, invite_expires_at, phone, village, status)
       VALUES ($1, $2, 'INVITE_PENDING', 'farmer', $3, $4, $5, $6, $7, 'pending')
       RETURNING id, name, email, status`,
      [name.trim(), normalEmail, req.user.id, token, expiresAt, phone, village]
    );

    const farmer     = rows[0];
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const inviteUrl   = `${frontendUrl}/invite?token=${token}`;

    // Send invite email (non-blocking — errors are logged but don't fail the request)
    sendFarmerInvite({
      toEmail:        farmer.email,
      toName:         farmer.name,
      supervisorName: req.user.name,
      inviteUrl,
    }).catch(err => console.error('Email send error:', err));

    return res.status(201).json({
      message:    'Farmer invited successfully',
      farmer:     { id: farmer.id, name: farmer.name, email: farmer.email, status: farmer.status },
      invite_url: inviteUrl, // returned for dev convenience
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/supervisor/my-visits
//  Last 5 visits made by the currently signed-in supervisor (staff_id = req.user.id).
// ─────────────────────────────────────────────────────────────────────────────
router.get('/my-visits', guard, async (req, res, next) => {
  try {
    const supervisorId = req.user.id;
    const result = await query(`
      SELECT
        v.id,
        v.visit_date,
        v.created_at,
        v.category,
        v.notes,
        v.supervisor_notes,
        f.id          AS farm_id,
        f.name        AS farm_name,
        u.id          AS farmer_id,
        u.name        AS farmer_name,
        t.full_text   AS transcript_snippet
      FROM   visits v
      JOIN   farms  f ON f.id = v.farm_id
      JOIN   users  u ON u.id = f.farmer_id
      LEFT JOIN transcripts t ON t.visit_id = v.id
      WHERE  v.staff_id = $1
      ORDER  BY v.created_at DESC
      LIMIT  5
    `, [supervisorId]);
    return res.json({ visits: result.rows });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/supervisor/my-invite-link
//  Returns (or lazily creates) the supervisor's permanent shareable token.
//  The supervisor copies this link and sends it to farmers via WhatsApp / SMS.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/my-invite-link', supGuard, async (req, res, next) => {
  try {
    const supId = req.user.id;

    // Check if a token already exists for this supervisor
    const { rows } = await query(
      `SELECT supervisor_link_token FROM users WHERE id = $1`,
      [supId]
    );

    let token = rows[0]?.supervisor_link_token;

    // Lazily generate one on first use
    if (!token) {
      token = crypto.randomBytes(24).toString('hex');
      await query(
        `UPDATE users SET supervisor_link_token = $1 WHERE id = $2`,
        [token, supId]
      );
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    return res.json({
      token,
      invite_url: `${frontendUrl}/invite?token=${token}`,
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  DELETE /api/supervisor/farmers/:id
//  Permanently removes a farmer that belongs to the current supervisor.
//  Cascades: farms → visits → transcripts → reports are all deleted via FK.
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/farmers/:id', supGuard, async (req, res, next) => {
  try {
    const supId    = req.user.id;
    const farmerId = req.params.id;

    // Verify this farmer belongs to the requesting supervisor
    const check = await query(
      `SELECT id FROM users
       WHERE id = $1 AND role = 'farmer' AND supervisor_id = $2`,
      [farmerId, supId]
    );
    if (!check.rows.length) {
      return res.status(404).json({ error: 'Farmer not found or not under your supervision.' });
    }

    await query(`DELETE FROM users WHERE id = $1`, [farmerId]);
    return res.json({ message: 'Farmer deleted successfully.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
