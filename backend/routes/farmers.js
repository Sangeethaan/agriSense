const express   = require('express');
const router    = express.Router();
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const roleGuard = require('../middleware/roleGuard');

// All routes here require an authenticated supervisor
const guard = [authenticate, roleGuard('supervisor')];

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/farmers/search?q=<term>
//  Multimodal: matches on farmer name OR farm location (village).
//  Returns a de-duplicated list of farmers with their farm count.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/search', guard, async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();

    if (!q) {
      return res.json({ farmers: [] });
    }

    const term = `%${q}%`;

    const { rows } = await query(
      `SELECT DISTINCT
          u.id,
          u.name,
          u.email,
          u.village,
          u.phone,
          u.created_at,
          COUNT(f.id) OVER (PARTITION BY u.id) AS farm_count
       FROM users u
       LEFT JOIN farms f ON f.farmer_id = u.id
       WHERE u.role = 'farmer'
         AND (
           u.name    ILIKE $1
           OR u.village ILIKE $1
           OR f.location ILIKE $1
         )
       ORDER BY u.name ASC
       LIMIT 50`,
      [term]
    );

    return res.json({ farmers: rows });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/farmers/:id/farms
//  Returns all farms/plots belonging to a specific farmer.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id/farms', guard, async (req, res, next) => {
  try {
    const { id } = req.params;

    // Verify the target user exists and is a farmer
    const userCheck = await query(
      `SELECT id, name, email, village, phone FROM users WHERE id = $1 AND role = 'farmer'`,
      [id]
    );

    if (!userCheck.rows.length) {
      return res.status(404).json({ error: 'Farmer not found' });
    }

    const farmer = userCheck.rows[0];

    const { rows: farms } = await query(
      `SELECT
          f.id,
          f.name,
          f.location,
          f.crop_types,
          f.created_at,
          COUNT(v.id) AS visit_count,
          MAX(v.visit_date) AS last_visit_date
       FROM farms f
       LEFT JOIN visits v ON v.farm_id = f.id
       WHERE f.farmer_id = $1
       GROUP BY f.id
       ORDER BY f.created_at DESC`,
      [id]
    );

    return res.json({ farmer, farms });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
