-- Feature 3: Interventions Timeline
-- Tracks treatments, medications, and dietary interventions with response tracking

CREATE TABLE IF NOT EXISTS patient_intervention (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_patient_id UUID REFERENCES canonical_patient(id) ON DELETE CASCADE,
    
    intervention_name TEXT NOT NULL, -- e.g. "Rifaximin 550mg TDS", "Low FODMAP Diet"
    intervention_type TEXT CHECK (intervention_type IN ('Medication', 'Diet', 'Supplement', 'Procedure', 'Lifestyle', 'Other')),
    
    start_date DATE, -- When started (if known)
    end_date DATE,   -- When stopped (null if ongoing)
    
    response TEXT CHECK (response IN ('Effective', 'Partial', 'Ineffective', 'Unknown', 'Ongoing')) DEFAULT 'Unknown',
    response_notes TEXT, -- e.g. "Bloating improved 70%"
    
    source_record_id UUID REFERENCES source_record_cache(id),
    lifecycle_state TEXT CHECK (lifecycle_state IN ('suggested', 'accepted', 'rejected', 'clinician_entered')) DEFAULT 'suggested',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_intervention_patient ON patient_intervention(canonical_patient_id);
CREATE INDEX IF NOT EXISTS idx_intervention_type ON patient_intervention(intervention_type);

-- Add extraction timestamp for incremental extraction
ALTER TABLE canonical_patient 
ADD COLUMN IF NOT EXISTS interventions_extracted_at TIMESTAMPTZ;
