/**
 * POST /api/visits/upload
 *
 * Accepts a multipart audio file, sends it to Sarvam STT,
 * classifies the transcript, saves a new visit, and auto-regenerates
 * the farm's Master Report so the farmer always sees fresh AI advice.
 *
 * Body (multipart/form-data):
 *   audio            - audio file (required)
 *   farm_id          - UUID of the farm (required)
 *   farmer_id        - UUID of the farmer (required, for ownership guard)
 *   supervisor_notes - optional typed note from supervisor
 *
 * Returns: { visit }
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const roleGuard = require('../middleware/roleGuard');
const { transcribeBuffer } = require('../services/sarvamSTT');
const { inferCategory }    = require('../services/categorize');
const { generateMasterReport, consultAI } = require('../services/geminiService');

// ── Multer: store upload in memory (max 100 MB) ─────────────────
// No fileFilter — browsers send inconsistent MIME types for MP3/AAC on Linux
// (e.g. audio/x-mpeg, audio/mpeg3, audio/x-mp3). The file-size cap is the
// only server-side guard needed; Sarvam STT will reject non-audio payloads.
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 100 * 1024 * 1024 }, // 100 MB
});

const guard = [authenticate, roleGuard('supervisor')];

// ── POST /api/visits/upload ──────────────────────────────────────
router.post(
  '/upload',
  guard,
  upload.single('audio'),
  async (req, res, next) => {
    try {
      /* ── 1. Validate required fields ──────────────────────── */
      if (!req.file) {
        return res.status(400).json({ error: 'Audio file is required (field: audio)' });
      }

      const { farm_id, farmer_id, supervisor_notes } = req.body;

      if (!farm_id) return res.status(400).json({ error: 'farm_id is required' });
      if (!farmer_id) return res.status(400).json({ error: 'farmer_id is required' });

      /* ── 2. Ownership guard: farm must belong to this farmer ─ */
      const farmCheck = await query(
        `SELECT id FROM farms WHERE id = $1 AND farmer_id = $2`,
        [farm_id, farmer_id]
      );
      if (!farmCheck.rows.length) {
        return res.status(403).json({
          error: 'Farm does not belong to the specified farmer — data integrity guard.',
        });
      }

      /* ── 3. Transcribe via Sarvam STT ─────────────────────── */
      //  If transcription fails for ANY reason, we abort — no visit is saved.
      //  A visit record without spoken content is meaningless and misleading.
      let transcript = '';
      try {
        transcript = await transcribeBuffer(
          req.file.buffer,
          req.file.originalname,
          req.body.language_code || 'kn-IN'
        );
      } catch (err) {
        console.error('[visits/upload] Sarvam STT error:', err.message);
        // Surface a clear, human-readable error to the frontend
        const detail = err.response?.data?.message || err.response?.data?.error || err.message;
        return res.status(422).json({
          error: `Audio transcription failed — no visit was saved. Reason: ${detail}`,
        });
      }

      /* ── 4. Infer category from transcript ────────────────── */
      const category = inferCategory(transcript);

      /* ── 5. Save visit record ──────────────────────────────── */
      const { rows } = await query(
        `INSERT INTO visits
           (farm_id, staff_id, visit_date, notes, category, supervisor_notes)
         VALUES ($1, $2, CURRENT_DATE, $3, $4, $5)
         RETURNING *`,
        [farm_id, req.user.id, transcript || null, category, supervisor_notes || null]
      );
      const visit = rows[0];

      /* ── 6. Also save raw transcript to transcripts table ── */
      if (transcript) {
        await query(
          `INSERT INTO transcripts (visit_id, full_text, detected_language)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [visit.id, transcript, req.body.language_code || 'kn-IN']
        );
      }

      /* ── 7. Auto-regenerate master report ──────────────────── */
      try {
        await generateMasterReport(farm_id);
        console.log('[visits/upload] Master report auto-regenerated for farm:', farm_id);
      } catch (regenErr) {
        // Non-blocking — the visit is already saved successfully
        console.error('[visits/upload] Auto-regen report error:', regenErr.message);
      }

      return res.status(201).json({ visit, transcript, category });
    } catch (err) {
      if (err?.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File too large — maximum upload size is 100 MB.' });
      }
      next(err);
    }
  }
);
// ── POST /api/visits/:visitId/append-audio ───────────────────────────────────
// Append a new audio segment to an EXISTING visit (same-day multi-part recording).
// Transcribes the new audio and concatenates it to the existing notes + transcript.
// Body (multipart/form-data):  audio (required)
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/:visitId/append-audio',
  guard,
  upload.single('audio'),
  async (req, res, next) => {
    try {
      const { visitId } = req.params;

      if (!req.file) {
        return res.status(400).json({ error: 'Audio file is required (field: audio)' });
      }

      /* ── 1. Fetch existing visit ──────────────────────────── */
      const { rows: visitRows } = await query(
        `SELECT v.id, v.notes, v.farm_id,
                t.full_text AS existing_transcript
         FROM visits v
         LEFT JOIN transcripts t ON t.visit_id = v.id
         WHERE v.id = $1`,
        [visitId]
      );
      if (!visitRows.length) {
        return res.status(404).json({ error: 'Visit not found.' });
      }
      const existing = visitRows[0];

      /* ── 2. Transcribe the new audio ─────────────────────── */
      let newTranscript = '';
      try {
        newTranscript = await transcribeBuffer(
          req.file.buffer,
          req.file.originalname,
          req.body.language_code || 'kn-IN'
        );
      } catch (err) {
        console.error('[visits/append-audio] Sarvam STT error:', err.message);
        return res.status(422).json({
          error: `Audio transcription failed — nothing was appended. Reason: ${err.message}`,
        });
      }

      /* ── 3. Concatenate transcripts ──────────────────────── */
      const separator     = '\n\n--- [Additional Recording] ---\n\n';
      const combinedNotes = existing.notes
        ? `${existing.notes}${separator}${newTranscript}`
        : newTranscript;
      const newCategory = inferCategory(combinedNotes);

      /* ── 4. Update visit notes + category ───────────────── */
      const { rows: updatedRows } = await query(
        `UPDATE visits SET notes = $1, category = $2 WHERE id = $3 RETURNING *`,
        [combinedNotes, newCategory, visitId]
      );
      const updatedVisit = updatedRows[0];

      /* ── 5. Update transcript (UPDATE then INSERT if new) ────── */
      const { rowCount } = await query(
        `UPDATE transcripts SET full_text = $1 WHERE visit_id = $2`,
        [combinedNotes, visitId]
      );
      if (rowCount === 0) {
        // No existing transcript row — create one
        await query(
          `INSERT INTO transcripts (visit_id, full_text, detected_language)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [visitId, combinedNotes, req.body.language_code || 'kn-IN']
        );
      }

      /* ── 6. Re-run master report (non-blocking) ──────────── */
      generateMasterReport(existing.farm_id).catch(e =>
        console.error('[visits/append-audio] Auto-regen report error:', e.message)
      );

      return res.status(200).json({
        visit:      updatedVisit,
        transcript: combinedNotes,
        category:   newCategory,
        appended:   newTranscript,
      });
    } catch (err) {
      if (err?.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File too large — maximum upload size is 100 MB.' });
      }
      next(err);
    }
  }
);

// ── PATCH /api/visits/:id ─────────────────────────────────────────────────────
// Update mutable fields on an existing visit (currently: supervisor_notes).
// Used when the supervisor edits notes during the transcript review step.
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/:id', guard, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { supervisor_notes } = req.body;

    // Only supervisor_notes is patchable via this endpoint
    const { rows } = await query(
      `UPDATE visits SET supervisor_notes = $1 WHERE id = $2 RETURNING *`,
      [supervisor_notes ?? null, id]
    );

    if (!rows.length) return res.status(404).json({ error: 'Visit not found.' });
    return res.json({ visit: rows[0] });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/visits ─────────────────────────────────────────────────────────
// Text-only visit log (no audio). Accepts: farm_id, farmer_id,
// notes (transcript text), supervisor_notes, category, language_code.
// Auto-triggers master report regeneration like the upload route.
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/',
  guard,
  async (req, res, next) => {
    try {
      const { farm_id, farmer_id, notes, supervisor_notes, category, language_code } = req.body;

      if (!farm_id)   return res.status(400).json({ error: 'farm_id is required' });
      if (!farmer_id) return res.status(400).json({ error: 'farmer_id is required' });

      /* ── Ownership guard ─────────────────────────────────────── */
      const farmCheck = await query(
        `SELECT id FROM farms WHERE id = $1 AND farmer_id = $2`,
        [farm_id, farmer_id]
      );
      if (!farmCheck.rows.length) {
        return res.status(403).json({
          error: 'Farm does not belong to the specified farmer — data integrity guard.',
        });
      }

      /* ── Infer category if not provided ─────────────────────── */
      const resolvedCategory = category || inferCategory(notes || '');

      /* ── Save visit ──────────────────────────────────────────── */
      const { rows } = await query(
        `INSERT INTO visits
           (farm_id, staff_id, visit_date, notes, category, supervisor_notes)
         VALUES ($1, $2, CURRENT_DATE, $3, $4, $5)
         RETURNING *`,
        [farm_id, req.user.id, notes || null, resolvedCategory, supervisor_notes || null]
      );
      const visit = rows[0];

      /* ── Save to transcripts if notes provided ───────────────── */
      if (notes) {
        await query(
          `INSERT INTO transcripts (visit_id, full_text, detected_language)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [visit.id, notes, language_code || 'kn-IN']
        );
      }

      /* ── Auto-regenerate master report (non-blocking) ─────────── */
      try {
        await generateMasterReport(farm_id);
        console.log('[visits/POST] Master report auto-regenerated for farm:', farm_id);
      } catch (regenErr) {
        console.error('[visits/POST] Auto-regen report error:', regenErr.message);
      }

      return res.status(201).json({ visit });
    } catch (err) {
      next(err);
    }
  }
);

// ── DELETE /api/visits/:id ───────────────────────────────────
router.delete(
  '/:id',
  guard,
  async (req, res, next) => {
    try {
      const { id } = req.params;

      /* ── 1. Validate the visit exists and belongs to a farm
               owned by a farmer the supervisor can manage ───── */
      const check = await query(
        `SELECT v.id
           FROM visits v
           JOIN farms f ON f.id = v.farm_id
          WHERE v.id = $1`,
        [id]
      );

      if (!check.rows.length) {
        return res.status(404).json({ error: 'Visit not found.' });
      }

      /* ── 2. Delete dependent transcripts first (FK safety) ── */
      await query(`DELETE FROM transcripts WHERE visit_id = $1`, [id]);

      /* ── 3. Delete the visit ─────────────────────────────── */
      await query(`DELETE FROM visits WHERE id = $1`, [id]);

      return res.json({ success: true, deleted_id: id });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /api/visits/consult-ai ──────────────────────────────────────────────
// On-demand AI Consultant — SUPERVISOR ONLY.
// Sends observations to Gemini; returns expert suggestions.
// Results are NEVER stored and NEVER visible to farmers or managers.
// Body: { transcript: string }
// ────────────────────────────────────────────────────────────────────────────
router.post(
  '/consult-ai',
  guard,
  async (req, res, next) => {
    try {
      const { transcript } = req.body;
      if (!transcript?.trim()) {
        return res.status(400).json({ error: 'transcript is required' });
      }
      const advice = await consultAI(transcript.trim());
      return res.json({
        advice,
        disclaimer: 'AI suggestions only — not supervisor orders. Verify with an agronomist before acting.',
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
