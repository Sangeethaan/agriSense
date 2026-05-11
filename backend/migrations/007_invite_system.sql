-- ============================================================
--  AgriSense – Migration 007: Supervisor-owned Farmers + Invite System
--  Run with:  psql $DATABASE_URL -f backend/migrations/007_invite_system.sql
-- ============================================================

-- 1. Add supervisor ownership FK to users (nullable — supervisors/managers have no supervisor)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS supervisor_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- 2. Invite token columns
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS invite_token       TEXT    UNIQUE,
  ADD COLUMN IF NOT EXISTS invite_expires_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS phone              VARCHAR(20),
  ADD COLUMN IF NOT EXISTS village            VARCHAR(120),
  ADD COLUMN IF NOT EXISTS status             VARCHAR(20) NOT NULL DEFAULT 'active';
  -- status: 'active' | 'pending'  (pending = invited, not yet accepted)

-- 3. Index on invite_token for fast lookup
CREATE INDEX IF NOT EXISTS idx_users_invite_token    ON users(invite_token);
CREATE INDEX IF NOT EXISTS idx_users_supervisor_id   ON users(supervisor_id);

-- ── Done ─────────────────────────────────────────────────────
