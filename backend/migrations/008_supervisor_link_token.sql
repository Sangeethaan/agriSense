-- ============================================================
--  AgriSense – Migration 008: Supervisor Permanent Invite Link Token
--  Run with:  psql $DATABASE_URL -f backend/migrations/008_supervisor_link_token.sql
-- ============================================================

-- Each supervisor gets a permanent shareable token.
-- When a farmer registers via this link they are linked to that supervisor.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS supervisor_link_token TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_users_supervisor_link_token ON users(supervisor_link_token);

-- ── Done ─────────────────────────────────────────────────────
