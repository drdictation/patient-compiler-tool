-- Add administrative fields
ALTER TABLE canonical_patient
ADD COLUMN IF NOT EXISTS date_of_birth DATE,
ADD COLUMN IF NOT EXISTS medicare_number TEXT,
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS ihi_number TEXT,
ADD COLUMN IF NOT EXISTS private_health_number TEXT,
ADD COLUMN IF NOT EXISTS mobile TEXT,
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS dva_number TEXT;

-- Add clinical metadata
ALTER TABLE canonical_patient
ADD COLUMN IF NOT EXISTS referring_doctor TEXT,
ADD COLUMN IF NOT EXISTS last_encounter_date DATE,
ADD COLUMN IF NOT EXISTS next_recall_date DATE;

-- Drop the view first to allow changing column definition/order
DROP VIEW IF EXISTS patient_summary;

-- Recreate the view with the new fields
CREATE OR REPLACE VIEW patient_summary AS
SELECT 
    p.id,
    p.display_name,
    p.normalized_name,
    p.identity_verified,
    MAX(e.encounter_date) as last_seen,
    p.referring_doctor,
    p.next_recall_date,
    COUNT(DISTINCT e.id) as encounter_count,
    COUNT(DISTINCT s.id) as record_count,
    COUNT(DISTINCT pi.id) FILTER (WHERE pi.lifecycle_state = 'suggested') + 
    COUNT(DISTINCT pinv.id) FILTER (WHERE pinv.lifecycle_state = 'suggested') +
    COUNT(DISTINCT pint.id) FILTER (WHERE pint.lifecycle_state = 'suggested') as suggested_items_count
FROM canonical_patient p
LEFT JOIN encounter e ON p.id = e.canonical_patient_id
LEFT JOIN source_record_cache s ON p.id = s.canonical_patient_id
LEFT JOIN patient_issue pi ON p.id = pi.canonical_patient_id
LEFT JOIN patient_investigation pinv ON p.id = pinv.canonical_patient_id
LEFT JOIN patient_intervention pint ON p.id = pint.canonical_patient_id
GROUP BY p.id;
