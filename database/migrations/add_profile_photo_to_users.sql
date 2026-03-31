-- ============================================================
-- Migration: Add profile_photo column to users table
-- Date: 2026-03-31
-- Description: Allows clients (and all users) to store a
--              Supabase Storage URL for their profile photo.
-- Safe to run multiple times (uses IF NOT EXISTS).
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo TEXT;
