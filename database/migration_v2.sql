-- 1. Change national_id from VARCHAR(50) to TEXT to support Supabase URLs
ALTER TABLE drivers 
ALTER COLUMN national_id TYPE TEXT;

-- 2. Change driving_license from VARCHAR(50) to TEXT
ALTER TABLE drivers 
ALTER COLUMN driving_license TYPE TEXT;

-- 3. Ensure profile_photo is TEXT (optional if already TEXT, but good for consistency)
ALTER TABLE drivers 
ALTER COLUMN profile_photo TYPE TEXT;

-- 4. Log the migration in a comment for your records
-- Migration applied on 2026-03-23 to fix "value too long" error (22001)