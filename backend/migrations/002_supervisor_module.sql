-- ============================================================
--  AgriSense – Migration 002: Supervisor Module
--  Run with:  psql $DATABASE_URL -f backend/migrations/002_supervisor_module.sql
-- ============================================================

-- ── 1. Extend users with village + phone ──────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS village VARCHAR(100),
  ADD COLUMN IF NOT EXISTS phone   VARCHAR(15) UNIQUE;

-- ── 2. visit_category ENUM ────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE visit_category AS ENUM (
    'Irrigation', 'Pesticide', 'Crop Health', 'Fertilizer', 'General'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 3. Extend visits ──────────────────────────────────────────
ALTER TABLE visits
  ADD COLUMN IF NOT EXISTS category       visit_category NOT NULL DEFAULT 'General',
  ADD COLUMN IF NOT EXISTS latitude       NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS longitude      NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS summary_report JSONB;

-- ── 4. master_reports (one living report per farm) ────────────
CREATE TABLE IF NOT EXISTS master_reports (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id       UUID        NOT NULL REFERENCES farms (id) ON DELETE CASCADE,
  content       JSONB       NOT NULL DEFAULT '{}',
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_master_reports_farm_id ON master_reports (farm_id);
CREATE INDEX        IF NOT EXISTS idx_visits_category        ON visits (category);

-- ── Done ──────────────────────────────────────────────────────
-- Verify: SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'visits';
