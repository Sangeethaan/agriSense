const express   = require('express');
const router    = express.Router();
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const roleGuard = require('../middleware/roleGuard');
const { GoogleGenerativeAI } = require('@google/generative-ai');

function stripMarkdown(raw) {
  return raw.replace(/```json|```/g, '').trim();
}

// ── Retry + fallback helper ──────────────────────────────────────────────────
const PRIMARY_MODEL   = 'gemini-2.5-flash';
const FALLBACK_MODEL  = 'gemini-2.0-flash';
const MAX_RETRIES     = 3;
const BASE_DELAY_MS   = 1000;

async function callGeminiWithRetry(apiKey, prompt) {
  const genAI = new GoogleGenerativeAI(apiKey);
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const model = genAI.getGenerativeModel({
        model: PRIMARY_MODEL,
        generationConfig: { temperature: 0.1 },
      });
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (err) {
      const is503 = err.message?.includes('503') || err.message?.includes('overloaded') || err.message?.includes('high demand');
      console.warn(`[Gemini] ${PRIMARY_MODEL} attempt ${attempt}/${MAX_RETRIES} failed:`, err.message);
      if (!is503 || attempt === MAX_RETRIES) break;
      await new Promise(r => setTimeout(r, BASE_DELAY_MS * Math.pow(2, attempt - 1)));
    }
  }
  console.warn(`[Gemini] Falling back to ${FALLBACK_MODEL}`);
  const genAI2 = new GoogleGenerativeAI(apiKey);
  const fallback = genAI2.getGenerativeModel({
    model: FALLBACK_MODEL,
    generationConfig: { temperature: 0.1 },
  });
  const result = await fallback.generateContent(prompt);
  return result.response.text();
}

const guard = [authenticate, roleGuard('manager')];

// ─────────────────────────────────────────────────────────────────────────────
//  Shared CTE — builds the full portfolio with health tier for every farm.
//  Health tier logic (SQL-first, no AI call):
//    grey   — no master report OR never visited
//    red    — master report has ≥1 risk flagged
//    yellow — last visit > 14 days ago OR farmer has incomplete tasks
//    green  — visited within 14 days AND all tasks complete (or no tasks)
// ─────────────────────────────────────────────────────────────────────────────
const PORTFOLIO_CTE = `
  WITH portfolio AS (
    SELECT
      f.id,
      f.name,
      f.location,
      f.crop_types,
      f.created_at,

      u_farmer.id       AS farmer_id,
      u_farmer.name     AS farmer_name,
      u_farmer.village  AS farmer_village,
      u_farmer.phone    AS farmer_phone,

      sup.supervisor_id,
      sup.supervisor_name,

      MAX(v.visit_date)                                                               AS last_visit_date,
      COUNT(v.id)                                                                     AS total_visits,
      COUNT(v.id) FILTER (WHERE v.visit_date >= CURRENT_DATE - INTERVAL '30 days')   AS recent_visits,
      (CURRENT_DATE - MAX(v.visit_date)::date)                                        AS days_since_visit,

      mr.content->>'current_health'                                AS current_health,
      COALESCE(jsonb_array_length(mr.content->'risks'),      0)   AS risk_count,
      COALESCE(jsonb_array_length(mr.content->'next_steps'), 0)   AS task_count,
      COALESCE(jsonb_array_length(mr.completed_tasks),       0)   AS completed_count,
      COALESCE(mr.content->'risks', '[]'::jsonb)                  AS risks,

      CASE
        WHEN mr.id IS NULL OR MAX(v.visit_date) IS NULL
          THEN 'grey'
        WHEN COALESCE(jsonb_array_length(mr.content->'risks'), 0) > 0
          THEN 'red'
        WHEN (CURRENT_DATE - MAX(v.visit_date)::date) > 14
             OR (
               COALESCE(jsonb_array_length(mr.content->'next_steps'), 0) > 0
               AND COALESCE(jsonb_array_length(mr.completed_tasks), 0) <
                   COALESCE(jsonb_array_length(mr.content->'next_steps'), 0)
             )
          THEN 'yellow'
        ELSE 'green'
      END AS health_tier,

      EXISTS (
        SELECT 1 FROM saved_reports sr WHERE sr.farm_id = f.id LIMIT 1
      ) AS has_saved_report

    FROM farms f
    JOIN  users u_farmer ON u_farmer.id = f.farmer_id
    LEFT JOIN visits          v  ON v.farm_id  = f.id
    LEFT JOIN master_reports  mr ON mr.farm_id = f.id
    LEFT JOIN LATERAL (
      SELECT u_s.id AS supervisor_id, u_s.name AS supervisor_name
      FROM   visits     v2
      JOIN   users      u_s ON u_s.id = v2.staff_id
      WHERE  v2.farm_id = f.id
      ORDER  BY v2.visit_date DESC, v2.created_at DESC
      LIMIT  1
    ) sup ON true
    GROUP BY
      f.id, f.name, f.location, f.crop_types, f.created_at,
      u_farmer.id, u_farmer.name, u_farmer.village, u_farmer.phone,
      sup.supervisor_id, sup.supervisor_name,
      mr.id, mr.content, mr.completed_tasks
  )
`;

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/manager/portfolio
//  Returns every farm with its computed health tier + summary KPI counts.
//  Ordered: red → yellow → green → grey, then oldest last visit first.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/portfolio', guard, async (req, res, next) => {
  try {
    const { rows } = await query(`
      ${PORTFOLIO_CTE}
      SELECT *
      FROM   portfolio
      ORDER BY
        CASE health_tier
          WHEN 'red'    THEN 1
          WHEN 'yellow' THEN 2
          WHEN 'green'  THEN 3
          ELSE               4
        END,
        last_visit_date ASC NULLS LAST
    `);

    // Compute KPI summary from the rows — no extra query needed
    const summary = { total: rows.length, red: 0, yellow: 0, green: 0, grey: 0 };
    for (const row of rows) summary[row.health_tier]++;

    return res.json({ summary, farms: rows });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/manager/risk-radar
//  Returns only farms in the red or yellow tier, ordered by severity.
//  red farms first (most risks at top), then yellow by days overdue.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/risk-radar', guard, async (req, res, next) => {
  try {
    const { rows } = await query(`
      ${PORTFOLIO_CTE}
      SELECT *
      FROM   portfolio
      WHERE  health_tier IN ('red', 'yellow')
      ORDER BY
        CASE health_tier WHEN 'red' THEN 1 ELSE 2 END,
        risk_count          DESC,
        days_since_visit    DESC NULLS LAST
    `);

    return res.json({ farms: rows, count: rows.length });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/manager/briefing
//  Management Auditor: enriches each farm with farmer name, supervisor name,
//  last-visit date, and task-completion rate before calling Gemini.
//  Only farms needing attention (active risks OR overdue > 14 days) are sent.
//  After parsing, supervisor_id / farmer_id are injected from the SQL results
//  so the frontend can navigate without relying on Gemini for IDs.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/briefing', guard, async (req, res, next) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
    }

    // ── 1. Enriched query: people + tasks + tier ───────────────────────────
    //  LATERAL finds the most-recent supervisor per farm.
    //  WHERE filters to only Red / Yellow farms before the data reaches Gemini.
    const { rows: farms } = await query(`
      SELECT
        f.id            AS farm_id,
        f.name          AS farm_name,
        f.crop_types,
        u_farmer.id     AS farmer_id,
        u_farmer.name   AS farmer_name,
        sup.supervisor_id,
        sup.supervisor_name,
        sup.last_visit_date,
        (CURRENT_DATE - sup.last_visit_date::date)                 AS days_since_visit,
        mr.content->'risks'                                         AS risks,
        mr.content->'next_steps'                                    AS next_steps,
        COALESCE(jsonb_array_length(mr.content->'next_steps'), 0)  AS total_tasks,
        COALESCE(jsonb_array_length(mr.completed_tasks),       0)  AS completed_count,
        CASE
          WHEN COALESCE(jsonb_array_length(mr.content->'risks'), 0) > 0 THEN 'Red'
          ELSE 'Yellow'
        END AS tier
      FROM master_reports mr
      JOIN  farms f        ON f.id        = mr.farm_id
      JOIN  users u_farmer ON u_farmer.id = f.farmer_id
      LEFT JOIN LATERAL (
        SELECT
          u_s.id            AS supervisor_id,
          u_s.name          AS supervisor_name,
          MAX(v2.visit_date) AS last_visit_date
        FROM   visits v2
        JOIN   users  u_s ON u_s.id = v2.staff_id
        WHERE  v2.farm_id = f.id
        GROUP  BY u_s.id, u_s.name
        ORDER  BY MAX(v2.visit_date) DESC
        LIMIT  1
      ) sup ON true
      WHERE
        COALESCE(jsonb_array_length(mr.content->'risks'), 0) > 0
        OR sup.last_visit_date IS NULL
        OR (CURRENT_DATE - sup.last_visit_date::date) > 14
      ORDER BY
        COALESCE(jsonb_array_length(mr.content->'risks'), 0) DESC,
        (CURRENT_DATE - sup.last_visit_date::date) DESC NULLS LAST
    `);

    if (!farms.length) {
      return res.json({
        briefing: {
          audits:           [],
          regional_outlook: 'All farms are healthy — no active risks or overdue visits.',
        },
        farms_analyzed: 0,
        generated_at:   new Date(),
      });
    }

    // ── 2. Build per-farm context with full human accountability data ──────
    const farmLines = farms.map(r => {
      const crops = Array.isArray(r.crop_types) && r.crop_types.length
        ? r.crop_types.join(', ') : 'Unknown';

      const risks = Array.isArray(r.risks) && r.risks.length
        ? r.risks.map((x, i) => `${i + 1}. ${x}`).join(' ')
        : 'None reported';

      const topStep = Array.isArray(r.next_steps) && r.next_steps.length
        ? r.next_steps[0] : 'No action recorded';

      const visitLine = r.days_since_visit != null
        ? `${r.days_since_visit} day${r.days_since_visit !== 1 ? 's' : ''} ago`
        : 'never visited';

      const supName = r.supervisor_name || 'Unknown Supervisor';

      const taskLine = r.total_tasks > 0
        ? `${r.farmer_name} has completed ${r.completed_count} of ${r.total_tasks} tasks ` +
          `(${Math.round((r.completed_count / r.total_tasks) * 100)}%)`
        : 'No tasks assigned yet';

      return [
        `Farm: "${r.farm_name}" | Tier: ${r.tier} | Crop: ${crops}`,
        `Farmer: ${r.farmer_name} | Supervisor: ${supName} | Last Visit: ${visitLine}`,
        `Task Progress: ${taskLine}`,
        `Active Risks: ${risks}`,
        `Top Recommended Action: ${topStep}`,
      ].join('\n');
    }).join('\n\n---\n\n');

    // ── 3. Management Auditor prompt ──────────────────────────────────────
    const prompt =
      'You are an Operations Auditor reporting to a Regional Manager.\n' +
      'Your goal: assess each farm\'s risk and recommend one clear action.\n\n' +
      'RULES:\n' +
      '1. ONLY use the provided data. Do not invent names, dates, or recommendations.\n' +
      '2. Only include farms that appear in the DATA section below.\n' +
      '3. For "situation": one sentence synthesizing the factual risk from the Active Risks field.\n' +
      '4. For "action": choose ONE directive — e.g. "Supervisor [Name] needs to follow up on [specific issue]" OR "Farmer [Name] needs encouragement to complete remaining tasks."\n' +
      '5. For "status": use the Tier value exactly (Red or Yellow).\n' +
      '6. Copy "farm_name", "farmer_name", "supervisor_name" exactly from the data — no paraphrasing.\n\n' +
      'FORMAT: Return ONLY a JSON object:\n' +
      '{\n' +
      '  "audits": [\n' +
      '    {\n' +
      '      "farm_name": "exact name",\n' +
      '      "farmer_name": "exact name",\n' +
      '      "supervisor_name": "exact name",\n' +
      '      "status": "Red",\n' +
      '      "situation": "one sentence",\n' +
      '      "action": "one directive sentence"\n' +
      '    }\n' +
      '  ],\n' +
      '  "regional_outlook": "one sentence on portfolio health"\n' +
      '}\n\n' +
      `DATA (${farms.length} farm${farms.length > 1 ? 's' : ''} needing attention):\n\n` +
      farmLines;

    // ── 4. Call Gemini (with retry + fallback) ──────────────────────────────
    const rawText = await callGeminiWithRetry(apiKey, prompt);
    const clean   = stripMarkdown(rawText);

    // ── 5. Parse with regex fallback ──────────────────────────────────────
    let briefing;
    try {
      briefing = JSON.parse(clean);
    } catch {
      const match = clean.match(/\{[\s\S]*\}/);
      if (match) {
        try { briefing = JSON.parse(match[0]); }
        catch { briefing = null; }
      }
    }

    // ── 6. Normalize + enrich with IDs from SQL ───────────────────────────
    if (!briefing || typeof briefing !== 'object') {
      briefing = { audits: [], regional_outlook: clean.slice(0, 300) };
    }
    if (!Array.isArray(briefing.audits))             briefing.audits          = [];
    if (typeof briefing.regional_outlook !== 'string') briefing.regional_outlook = '';

    // Build a lookup by farm name so we can inject IDs Gemini cannot provide
    const farmLookup = new Map(farms.map(f => [f.farm_name, f]));
    const sentNames  = new Set(farms.map(f => f.farm_name));

    briefing.audits = briefing.audits
      .filter(a => a && typeof a.farm_name === 'string' && sentNames.has(a.farm_name))
      .map(a => {
        const orig = farmLookup.get(a.farm_name) || {};
        return {
          farm_name:       String(a.farm_name       || ''),
          farmer_name:     String(a.farmer_name     || orig.farmer_name     || ''),
          supervisor_name: String(a.supervisor_name || orig.supervisor_name || ''),
          supervisor_id:   orig.supervisor_id  || null,
          farmer_id:       orig.farmer_id      || null,
          status:          String(a.status          || 'Yellow'),
          situation:       String(a.situation       || ''),
          action:          String(a.action          || ''),
          // SQL-derived accountability data (rendered directly in UI — no AI needed)
          days_since_visit: orig.days_since_visit ?? null,
          completed_count:  orig.completed_count  ?? 0,
          total_tasks:      orig.total_tasks      ?? 0,
        };
      });

    return res.json({
      briefing,
      farms_analyzed: farms.length,
      generated_at:   new Date(),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
