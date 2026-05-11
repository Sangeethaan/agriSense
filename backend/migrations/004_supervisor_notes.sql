-- ============================================================
--  AgriSense – Migration 004: Supervisor Notes
--  Run with:  psql $DATABASE_URL -f backend/migrations/004_supervisor_notes.sql
-- ============================================================

-- Stores typed supervisor observations that shouldn't be said aloud
-- (e.g., "Farmer seems overwhelmed, keep instructions simple")
ALTER TABLE visits
  ADD COLUMN IF NOT EXISTS supervisor_notes TEXT;

-- ── Done ─────────────────────────────────────────────────────
