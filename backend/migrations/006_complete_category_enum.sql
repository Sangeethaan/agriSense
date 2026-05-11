-- ============================================================
--  AgriSense – Migration 006: Complete visit_category ENUM
--  Run with:  psql $DATABASE_URL -f backend/migrations/006_complete_category_enum.sql
-- ============================================================

-- Migration 002 created the enum with only:
--   'Irrigation', 'Pesticide', 'Crop Health', 'Fertilizer', 'General'
--
-- categorize.js also produces 'Disease' and 'Urgent'.
-- Migration 005 adds 'Farmer Note' for farmer-reported issues.
-- This migration ensures ALL values are present idempotently.

ALTER TYPE visit_category ADD VALUE IF NOT EXISTS 'Disease';
ALTER TYPE visit_category ADD VALUE IF NOT EXISTS 'Urgent';
ALTER TYPE visit_category ADD VALUE IF NOT EXISTS 'Farmer Note';

-- ── Done ─────────────────────────────────────────────────────
-- Verify: SELECT enumlabel FROM pg_enum
--           JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
--          WHERE pg_type.typname = 'visit_category'
--          ORDER BY enumsortorder;
