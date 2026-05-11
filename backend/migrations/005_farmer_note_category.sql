-- ============================================================
--  AgriSense – Migration 005: Farmer Note category
--  Run with:  psql $DATABASE_URL -f backend/migrations/005_farmer_note_category.sql
-- ============================================================

-- Allows farmers to report issues between supervisor visits.
ALTER TYPE visit_category ADD VALUE IF NOT EXISTS 'Farmer Note';

-- ── Done ─────────────────────────────────────────────────────
