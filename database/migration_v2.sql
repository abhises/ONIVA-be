-- 1. Change national_id from VARCHAR(50) to TEXT to support Supabase URLs
ALTER TABLE drivers 
ADD COLUMN national_id_url TEXT,
ADD COLUMN driving_license_url TEXT;

-- Also ensure these are TEXT to prevent the 22001 error
ALTER TABLE drivers ALTER COLUMN national_id TYPE TEXT;
ALTER TABLE drivers ALTER COLUMN driving_license TYPE TEXT;

-- 4. Log the migration in a comment for your records
-- Migration applied on 2026-03-23 to fix "value too long" error (22001)