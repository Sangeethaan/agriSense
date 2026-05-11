const express   = require('express');
const router    = express.Router();
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const roleGuard = require('../middleware/roleGuard');

const guard = [authenticate, roleGuard('farmer')];

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/farmer/my-farm
//  Returns the authenticated farmer's primary farm, latest 10 visits,
//  AI master report, and which tasks they've already completed.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/my-farm', guard, async (req, res, next) => {
  try {
    const farmerId = req.user.id;
    const requestedFarmId = req.query.farm_id;

    const { rows: farms } = await query(
      `SELECT id, name, location, crop_types, created_at
       FROM   farms
       WHERE  farmer_id = $1
       ORDER  BY created_at ASC`,
      [farmerId]
    );

    if (!farms.length) {
      return res.json({ farm: null, farms: [], visits: [], master_report: null });
    }

    let primaryFarm = farms[0];

    if (requestedFarmId) {
      const found = farms.find(f => f.id === requestedFarmId);
      if (found) primaryFarm = found;
    } else {
      // Determine primary farm: farm with the most recent visit
      const { rows: recentVisit } = await query(
        `SELECT farm_id FROM visits v
         JOIN farms f ON f.id = v.farm_id
         WHERE f.farmer_id = $1
         ORDER BY v.visit_date DESC, v.created_at DESC
         LIMIT 1`,
         [farmerId]
      );
      if (recentVisit.length > 0) {
        const recentFarm = farms.find(f => f.id === recentVisit[0].farm_id);
        if (recentFarm) primaryFarm = recentFarm;
      }
    }

    // ── Fetch visits ONLY for the primary farm ──────────
    const { rows: visits } = await query(
      `SELECT
         v.id,
         v.visit_date,
         v.category,
         v.notes,
         v.created_at,
         f.name  AS farm_name,
         t.full_text AS transcript
       FROM   visits v
       JOIN   farms f ON f.id = v.farm_id
       LEFT JOIN transcripts t ON t.visit_id = v.id
       WHERE  v.farm_id = $1
       ORDER  BY v.visit_date DESC, v.created_at DESC
       LIMIT  20`,
      [primaryFarm.id]
    );

    // ── Master report for the primary farm ───────────────────
    const { rows: reportRows } = await query(
      `SELECT content, completed_tasks, updated_at
       FROM   master_reports
       WHERE  farm_id = $1
       LIMIT  1`,
      [primaryFarm.id]
    );

    const master_report = reportRows.length
      ? {
          ...reportRows[0].content,
          completed_tasks: reportRows[0].completed_tasks || [],
          updated_at:      reportRows[0].updated_at,
        }
      : null;

    return res.json({ farm: primaryFarm, farms, visits, master_report });
  } catch (err) {
    next(err);
  }
});


// ─────────────────────────────────────────────────────────────────────────────
//  PATCH /api/farmer/tasks
//  Toggles a task's completion status in master_reports.completed_tasks.
//  Body: { farm_id: string, task_text: string, is_completed: boolean }
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/tasks', guard, async (req, res, next) => {
  try {
    const farmerId = req.user.id;
    const { farm_id, task_text, is_completed } = req.body;

    if (!farm_id || typeof task_text !== 'string') {
      return res.status(400).json({ error: 'farm_id and task_text are required' });
    }

    // Verify the farm belongs to this farmer
    const { rows: ownership } = await query(
      `SELECT id FROM farms WHERE id = $1 AND farmer_id = $2`,
      [farm_id, farmerId]
    );
    if (!ownership.length) {
      return res.status(403).json({ error: 'Farm not found' });
    }

    // Fetch current completed_tasks array
    const { rows } = await query(
      `SELECT completed_tasks FROM master_reports WHERE farm_id = $1`,
      [farm_id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'No report found for this farm' });
    }

    let completed = rows[0].completed_tasks || [];

    if (is_completed) {
      if (!completed.includes(task_text)) completed = [...completed, task_text];
    } else {
      completed = completed.filter(t => t !== task_text);
    }

    await query(
      `UPDATE master_reports SET completed_tasks = $1 WHERE farm_id = $2`,
      [JSON.stringify(completed), farm_id]
    );

    return res.json({ completed_tasks: completed });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/farmer/report-issue
//  Farmer-initiated alert — creates a visit record with category 'Farmer Note'
//  so the supervisor sees it on the farm timeline at their next review.
//  Body: { farm_id: UUID, message: string }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/report-issue', guard, async (req, res, next) => {
  try {
    const farmerId = req.user.id;
    const { farm_id, message } = req.body;

    if (!farm_id || !message?.trim()) {
      return res.status(400).json({ error: 'farm_id and message are required' });
    }

    // Verify the farm belongs to this farmer
    const { rows: ownership } = await query(
      `SELECT id FROM farms WHERE id = $1 AND farmer_id = $2`,
      [farm_id, farmerId]
    );
    if (!ownership.length) {
      return res.status(403).json({ error: 'Farm not found or not yours' });
    }

    // Insert as a visit with category 'Farmer Note' and staff_id = farmer's own ID
    const { rows } = await query(
      `INSERT INTO visits
         (farm_id, staff_id, visit_date, notes, category)
       VALUES ($1, $2, CURRENT_DATE, $3, 'Farmer Note')
       RETURNING *`,
      [farm_id, farmerId, message.trim()]
    );

    return res.status(201).json({ visit: rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
