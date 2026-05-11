const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const roleGuard = require('../middleware/roleGuard');
const { generateMasterReport, generateIncrementalReport } = require('../services/geminiService');

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/farms
//  • supervisor  → all farms (with farmer name)
//  • farmer      → only their own farms
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', authenticate, async (req, res, next) => {
  try {
    let result;

    if (req.user.role === 'supervisor' || req.user.role === 'manager') {
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

    const [visitsResult, reportResult] = await Promise.all([
      query(
        `SELECT
            v.id,
            v.visit_date,
            v.category,
            v.latitude,
            v.longitude,
            v.notes,
            v.supervisor_notes,
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
      ),
      query(
        'SELECT content, completed_tasks, updated_at FROM master_reports WHERE farm_id = $1 LIMIT 1',
        [farmId]
      ),
    ]);

    const masterReport = (() => {
      if (!reportResult.rows.length) return null;
      const row = reportResult.rows[0];
      // Defensively parse content — PostgreSQL JSONB comes back as an object,
      // but older rows may have been inserted as a plain JSON string.
      let content = row.content;
      if (typeof content === 'string') {
        try { content = JSON.parse(content); } catch { content = {}; }
      }
      // If content itself has a nested `current_health` that is still a JSON
      // string (double-encoded), decode it one more time.
      if (typeof content?.current_health === 'string') {
        try {
          const inner = JSON.parse(content.current_health);
          if (inner && typeof inner === 'object') content = { ...content, ...inner };
        } catch { /* already a plain string — leave it */ }
      }
      return {
        ...content,
        completed_tasks: row.completed_tasks || [],
        updated_at: row.updated_at,
      };
    })();

    return res.json({ farm_id: farmId, visits: visitsResult.rows, master_report: masterReport });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/farms/:farmId/master-report   (supervisor only)
//  Triggers an LLM regeneration of the farm's Master Report from visit data.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:farmId/master-report', authenticate, roleGuard('supervisor'), async (req, res, next) => {
  try {
    const { farmId } = req.params;
    const report = await generateMasterReport(farmId);

    if (!report) {
      return res.status(400).json({ error: 'No visits found for this farm. Add a visit first.' });
    }

    return res.json({ master_report: report });
  } catch (err) {
    if (err.response?.status === 401) {
      return res.status(502).json({ error: 'Sarvam API authentication failed. Check SARVAM_API_KEY.' });
    }
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/farms/:farmId/generate-report   (supervisor only)
//  Runs incremental (or full-fallback) report generation.
//  Returns a DRAFT — does NOT save to saved_reports.
//  The supervisor reviews this, then calls /save-report to commit.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:farmId/generate-report', authenticate, roleGuard('supervisor'), async (req, res, next) => {
  try {
    const { farmId } = req.params;
    const result = await generateIncrementalReport(farmId);

    if (!result) {
      return res.status(400).json({ error: 'No visits found for this farm. Add a visit first.' });
    }

    return res.json({
      report:              result.report,
      mode:                result.mode,
      new_visit_count:     result.visitCount,
      last_visit_id:       result.lastVisitId,
      has_prior_saved:     result.hasPriorSavedReport,
      prior_report_number: result.priorReportNumber,
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/farms/:farmId/save-report   (supervisor only)
//  Commits a draft report to saved_reports (the approved snapshot table).
//  Body: { content, last_visit_id, visit_count }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:farmId/save-report', authenticate, roleGuard('supervisor'), async (req, res, next) => {
  try {
    const { farmId } = req.params;
    const { content, last_visit_id, visit_count } = req.body;

    if (!content) return res.status(400).json({ error: 'content is required' });

    // Determine the next report number for this farm
    const { rows: maxRows } = await query(
      'SELECT COALESCE(MAX(report_number), 0) AS max_num FROM saved_reports WHERE farm_id = $1',
      [farmId]
    );
    const nextNumber = (maxRows[0]?.max_num || 0) + 1;

    // Pull completed_tasks from current master_report to preserve farmer progress
    const { rows: mrRows } = await query(
      'SELECT completed_tasks FROM master_reports WHERE farm_id = $1',
      [farmId]
    );
    const completedTasks = mrRows[0]?.completed_tasks || [];

    // Reconcile completed tasks against new instructions
    let reconciledCompleted = [];
    const instructions = content.supervisor_instructions || content.next_steps || [];
    if (instructions.length) {
      const newSet = new Set(instructions.map(s => String(s).trim().toLowerCase()));
      reconciledCompleted = completedTasks.filter(task => newSet.has(String(task).trim().toLowerCase()));
    }

    const { rows } = await query(
      `INSERT INTO saved_reports
         (farm_id, supervisor_id, content, completed_tasks, last_visit_id, visit_count, report_number)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7)
       RETURNING *`,
      [
        farmId,
        req.user.id,
        JSON.stringify(content),
        JSON.stringify(reconciledCompleted),
        last_visit_id || null,
        visit_count   || 0,
        nextNumber,
      ]
    );

    // Update the live master_report so the farmer & supervisor see the new active tasks
    await query(
      `INSERT INTO master_reports (farm_id, content, completed_tasks, generated_at, updated_at)
       VALUES ($1, $2::jsonb, $3::jsonb, NOW(), NOW())
       ON CONFLICT (farm_id)
       DO UPDATE SET
         content         = EXCLUDED.content,
         completed_tasks = EXCLUDED.completed_tasks,
         updated_at      = NOW()`,
      [farmId, JSON.stringify(content), JSON.stringify(reconciledCompleted)]
    );

    return res.status(201).json({ saved_report: rows[0] });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/farms/:farmId/saved-reports/latest   (supervisor + manager + farmer[own])
//  Returns the full content of the most recent saved report for PDF generation.
//  NOTE: This route is registered BEFORE /saved-reports (the list route) to
//        prevent Express from treating 'latest' as a dynamic segment.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:farmId/saved-reports/latest', authenticate, async (req, res, next) => {
  try {
    const { farmId } = req.params;

    if (req.user.role === 'farmer') {
      const { rows } = await query('SELECT id FROM farms WHERE id = $1 AND farmer_id = $2', [farmId, req.user.id]);
      if (!rows.length) return res.status(403).json({ error: 'Forbidden' });
    }

    const { rows } = await query(
      `SELECT
         sr.id, sr.report_number, sr.visit_count, sr.saved_at,
         sr.content, sr.completed_tasks,
         u.name      AS supervisor_name,
         f.name      AS farm_name,
         f.location,
         f.crop_types,
         farmer.name AS farmer_name
       FROM   saved_reports sr
       LEFT JOIN users  u      ON u.id      = sr.supervisor_id
       LEFT JOIN farms  f      ON f.id      = sr.farm_id
       LEFT JOIN users  farmer ON farmer.id = f.farmer_id
       WHERE  sr.farm_id = $1
       ORDER  BY sr.saved_at DESC
       LIMIT  1`,
      [farmId]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'No saved report found for this farm' });
    }

    return res.json({ saved_report: rows[0] });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/farms/:farmId/saved-reports   (supervisor + manager + farmer[own])
//  Lists all saved report snapshots for a farm (metadata only, not full content).
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:farmId/saved-reports', authenticate, async (req, res, next) => {
  try {
    const { farmId } = req.params;

    if (req.user.role === 'farmer') {
      const { rows } = await query('SELECT id FROM farms WHERE id = $1 AND farmer_id = $2', [farmId, req.user.id]);
      if (!rows.length) return res.status(403).json({ error: 'Forbidden' });
    }

    const { rows } = await query(
      `SELECT
         sr.id, sr.report_number, sr.visit_count, sr.saved_at,
         u.name AS supervisor_name
       FROM   saved_reports sr
       LEFT JOIN users u ON u.id = sr.supervisor_id
       WHERE  sr.farm_id = $1
       ORDER  BY sr.saved_at DESC`,
      [farmId]
    );

    return res.json({ saved_reports: rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;


