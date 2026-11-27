-- Add persistent Clinical Snapshot JSONB column to canonical_patient
-- Stores clinician-curated quick-reference fields: { keySx, phx, ix, medsAndPlan, updatedAt }
ALTER TABLE canonical_patient
ADD COLUMN IF NOT EXISTS clinical_snapshot JSONB;
