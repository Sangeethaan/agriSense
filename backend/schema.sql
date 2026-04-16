-- ============================================================
--  AgriSense – PostgreSQL Schema (Phase 1)
--  Run with:  psql $DATABASE_URL -f backend/schema.sql
-- ============================================================

-- ── Extensions ───────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()

-- ── ENUM types ───────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('supervisor', 'farmer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── users ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(120)  NOT NULL,
  email         VARCHAR(255)  NOT NULL UNIQUE,
  password_hash TEXT          NOT NULL,
  role          user_role     NOT NULL DEFAULT 'farmer',
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- ── farms ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS farms (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  farmer_id   UUID          NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name        VARCHAR(180)  NOT NULL,
  location    TEXT,
  crop_types  TEXT[]        NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_farms_farmer_id ON farms (farmer_id);

-- ── visits ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS visits (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id     UUID        NOT NULL REFERENCES farms (id) ON DELETE CASCADE,
  staff_id    UUID        NOT NULL REFERENCES users (id) ON DELETE SET NULL,
  visit_date  DATE        NOT NULL,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_visits_farm_id  ON visits (farm_id);
CREATE INDEX IF NOT EXISTS idx_visits_staff_id ON visits (staff_id);

-- ── transcripts ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transcripts (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id          UUID          NOT NULL REFERENCES visits (id) ON DELETE CASCADE,
  audio_filename    VARCHAR(255),
  full_text         TEXT          NOT NULL DEFAULT '',
  detected_language VARCHAR(20),
  topic_category    VARCHAR(120),
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transcripts_visit_id ON transcripts (visit_id);

-- ── reports ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reports (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  transcript_id   UUID        NOT NULL REFERENCES transcripts (id) ON DELETE CASCADE,
  crop_type       VARCHAR(120),
  issues_raised   TEXT,
  inputs_used     TEXT,
  actions_taken   TEXT,
  follow_up_date  DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reports_transcript_id ON reports (transcript_id);
