
-- Create patient_issue table
CREATE TABLE IF NOT EXISTS patient_issue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_patient_id UUID REFERENCES canonical_patient(id) ON DELETE CASCADE,
  issue_name TEXT NOT NULL,
  issue_key TEXT NOT NULL, -- Normalized key (lowercase, trimmed) for dedupe
  status TEXT CHECK (status IN ('active', 'monitoring', 'resolved')) DEFAULT 'active',
  lifecycle_state TEXT CHECK (lifecycle_state IN ('suggested', 'accepted', 'rejected', 'clinician_entered')) DEFAULT 'suggested',
  first_mentioned_date DATE,
  resolved_date DATE,
  evidence_quote TEXT, -- Short snippet justifying the status
  last_updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(canonical_patient_id, issue_key)
);

CREATE INDEX IF NOT EXISTS idx_patient_issue_patient ON patient_issue(canonical_patient_id);

-- Create patient_issue_source table (Many-to-Many)
CREATE TABLE IF NOT EXISTS patient_issue_source (
  patient_issue_id UUID REFERENCES patient_issue(id) ON DELETE CASCADE,
  encounter_id UUID REFERENCES encounter(id) ON DELETE CASCADE,
  source_record_id UUID REFERENCES source_record_cache(id), -- Specific record used
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (patient_issue_id, encounter_id)
);

-- Add tracking for extraction runs to patient (simple version)
ALTER TABLE canonical_patient 
ADD COLUMN IF NOT EXISTS issues_extracted_at TIMESTAMPTZ;
