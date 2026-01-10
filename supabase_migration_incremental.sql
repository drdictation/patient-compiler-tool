-- Add columns to track when extractions were last run
-- This enables incremental extraction (only process new records)

ALTER TABLE canonical_patient 
ADD COLUMN IF NOT EXISTS issues_extracted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS investigations_extracted_at TIMESTAMPTZ;

-- Optional: Add a general-purpose last_processed_at if wanted for other features
ALTER TABLE canonical_patient 
ADD COLUMN IF NOT EXISTS last_processed_at TIMESTAMPTZ;
