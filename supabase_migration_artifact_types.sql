-- Drop the old constraint
ALTER TABLE artifact DROP CONSTRAINT IF EXISTS artifact_artifact_type_check;

-- Add the updated constraint including the two new document types
ALTER TABLE artifact ADD CONSTRAINT artifact_artifact_type_check 
CHECK (artifact_type IN ('RAW_TRANSCRIPT', 'INTERNAL_NOTE', 'REFERRER_LETTER', 'REFERRAL_LETTER', 'PATIENT_SUMMARY'));
