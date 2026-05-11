-- ============================================================
--  Migration 009 — saved_reports
--
--  Adds a `saved_reports` table for supervisor-approved farm
--  health report snapshots.
--
--  Design notes:
--  • `master_reports` (existing) stays as the live auto-draft.
--  • `saved_reports` is the immutable, approved-snapshot layer.
--  • `last_visit_id` is the cursor/marker — the next incremental
--    report generation will only read visits with id > this value.
--  • `report_number` is a per-farm sequential counter (1, 2, 3…).
-- ============================================================

CREATE TABLE IF NOT EXISTS saved_reports (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id         UUID        NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  supervisor_id   UUID        REFERENCES users(id) ON DELETE SET NULL,
  content         JSONB       NOT NULL,
  completed_tasks JSONB       NOT NULL DEFAULT '[]',
  -- The visit ID that was the most recent visit included in this report.
  -- Next generation will query: WHERE visits.id > last_visit_id (ordered by created_at).
  last_visit_id   UUID        REFERENCES visits(id) ON DELETE SET NULL,
  -- Human-readable count: "Based on N field visits"
  visit_count     INTEGER     NOT NULL DEFAULT 0,
  -- Per-farm sequential number: Report #1, Report #2, …
  report_number   INTEGER     NOT NULL DEFAULT 1,
  saved_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_reports_farm_id    ON saved_reports (farm_id);
CREATE INDEX IF NOT EXISTS idx_saved_reports_supervisor ON saved_reports (supervisor_id);
-- For fast "latest report" lookups
CREATE INDEX IF NOT EXISTS idx_saved_reports_saved_at   ON saved_reports (farm_id, saved_at DESC);
