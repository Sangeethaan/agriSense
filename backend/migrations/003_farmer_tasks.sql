-- ============================================================
--  AgriSense – Migration 003: Farmer Task Completion
--  Run with:  psql $DATABASE_URL -f backend/migrations/003_farmer_tasks.sql
-- ============================================================

-- Stores which AI-suggested tasks the farmer has marked as done.
-- Keyed by task text so completion survives minor report regenerations.
ALTER TABLE master_reports
  ADD COLUMN IF NOT EXISTS completed_tasks JSONB NOT NULL DEFAULT '[]';

-- ── Done ─────────────────────────────────────────────────────
-- Verify: SELECT column_name FROM information_schema.columns WHERE table_name = 'master_reports';
