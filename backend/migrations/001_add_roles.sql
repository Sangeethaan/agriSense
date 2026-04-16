-- ============================================================
--  Migration 001: Add 'pending' and 'manager' to user_role enum
--  Run with: psql $DATABASE_URL -f backend/migrations/001_add_roles.sql
-- ============================================================

-- PostgreSQL ALTER TYPE ADD VALUE cannot run inside a transaction block.
-- Run this file directly against the DB (not in a transaction).

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'pending';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'manager';

-- Allow Google OAuth users to be inserted with role='pending'
-- (remove the DEFAULT 'farmer' fallback so new Google users must choose explicitly)
ALTER TABLE users ALTER COLUMN role DROP DEFAULT;
