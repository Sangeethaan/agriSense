const express    = require('express');
const router     = express.Router();
const { query }  = require('../db');
const { authenticate } = require('../middleware/auth');
const roleGuard  = require('../middleware/roleGuard');

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/farms
//  • supervisor  → all farms (with farmer name)
//  • farmer      → only their own farms
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', authenticate, async (req, res, next) => {
  try {
    let result;

    if (req.user.role === 'supervisor') {
      result = await query(
        `SELECT f.id, f.name, f.location, f.crop_types, f.created_at,
                u.id   AS farmer_id,
                u.name AS farmer_name,
                u.email AS farmer_email
         FROM   farms f
         JOIN   users u ON u.id = f.farmer_id
         ORDER  BY f.created_at DESC`
      );
    } else {
      // farmer sees only their own farms
      result = await query(
        `SELECT id, name, location, crop_types, created_at
         FROM   farms
         WHERE  farmer_id = $1
         ORDER  BY created_at DESC`,
        [req.user.id]
      );
    }

    return res.json({ farms: result.rows });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/farms/:id
//  • supervisor  → any farm
//  • farmer      → only if it belongs to them
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;

    const { rows } = await query(
      `SELECT f.id, f.name, f.location, f.crop_types, f.created_at,
              u.id   AS farmer_id,
              u.name AS farmer_name
       FROM   farms f
       JOIN   users u ON u.id = f.farmer_id
       WHERE  f.id = $1`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Farm not found' });
    }

    const farm = rows[0];

    // Farmers can only view their own farm
    if (req.user.role === 'farmer' && farm.farmer_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden – this farm does not belong to you' });
    }

    return res.json({ farm });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/farms          (supervisor only)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', authenticate, roleGuard('supervisor'), async (req, res, next) => {
  try {
    const { farmer_id, name, location, crop_types = [] } = req.body;

    if (!farmer_id || !name) {
      return res.status(400).json({ error: 'farmer_id and name are required' });
    }

    const { rows } = await query(
      `INSERT INTO farms (farmer_id, name, location, crop_types)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [farmer_id, name.trim(), location || null, crop_types]
    );

    return res.status(201).json({ message: 'Farm created', farm: rows[0] });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  PATCH /api/farms/:id     (supervisor only)
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/:id', authenticate, roleGuard('supervisor'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, location, crop_types } = req.body;

    const { rows } = await query(
      `UPDATE farms
       SET    name       = COALESCE($1, name),
              location   = COALESCE($2, location),
              crop_types = COALESCE($3, crop_types)
       WHERE  id = $4
       RETURNING *`,
      [name || null, location || null, crop_types || null, id]
    );

    if (!rows.length) return res.status(404).json({ error: 'Farm not found' });

    return res.json({ message: 'Farm updated', farm: rows[0] });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  DELETE /api/farms/:id    (supervisor only)
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:id', authenticate, roleGuard('supervisor'), async (req, res, next) => {
  try {
    const { rows } = await query(
      'DELETE FROM farms WHERE id = $1 RETURNING id',
      [req.params.id]
    );

    if (!rows.length) return res.status(404).json({ error: 'Farm not found' });

    return res.json({ message: 'Farm deleted' });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/farms/:farmId/history
//  Chronological visit history for a specific farm plot.
//  Supervisor: any farm.  Farmer: only their own.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:farmId/history', authenticate, async (req, res, next) => {
  try {
    const { farmId } = req.params;

    // Ownership check for farmer role
    if (req.user.role === 'farmer') {
      const { rows } = await query(
        'SELECT id FROM farms WHERE id = $1 AND farmer_id = $2',
        [farmId, req.user.id]
      );
      if (!rows.length) {
        return res.status(403).json({ error: 'Forbidden – this farm does not belong to you' });
      }
    }

    const { rows: visits } = await query(
      `SELECT
          v.id,
          v.visit_date,
          v.category,
          v.latitude,
          v.longitude,
          v.notes,
          v.summary_report,
          v.created_at,
          u.id   AS staff_id,
          u.name AS staff_name,
          t.full_text        AS transcript_text,
          t.detected_language
       FROM   visits v
       LEFT JOIN users       u ON u.id = v.staff_id
       LEFT JOIN transcripts t ON t.visit_id = v.id
       WHERE  v.farm_id = $1
       ORDER  BY v.visit_date DESC, v.created_at DESC`,
      [farmId]
    );

    return res.json({ farm_id: farmId, visits });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

