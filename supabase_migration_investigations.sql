-- Create the table for storing extracted investigations
CREATE TABLE IF NOT EXISTS patient_investigation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_patient_id UUID REFERENCES canonical_patient(id) ON DELETE CASCADE,
    
    test_name TEXT NOT NULL,
    test_category TEXT CHECK (test_category IN ('Endoscopy', 'Imaging', 'Pathology', 'Manometry', 'Other')),
    
    -- Date logic: The date the test was PERFORMED (or planned for)
    test_date DATE,
    
    -- Result summary: Short extract found by AI
    result_summary TEXT,
    
    -- Status of the *test event itself*
    status TEXT CHECK (status IN ('Completed', 'Planned', 'Pending')) DEFAULT 'Completed',
    
    -- Recall / Surveillance Tracking
    -- The date the NEXT one is due. This is distinct from 'test_date'.
    -- E.g., This record is "Colonoscopy (2024)", but recall is "2029".
    next_due_date DATE, 
    
    -- Source link
    source_record_id UUID REFERENCES source_record_cache(id),
    
    -- Lifecycle state for Curation
    lifecycle_state TEXT CHECK (lifecycle_state IN ('suggested', 'accepted', 'rejected', 'clinician_entered')) DEFAULT 'suggested',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indicies for performance
CREATE INDEX IF NOT EXISTS idx_investigation_patient ON patient_investigation(canonical_patient_id);
CREATE INDEX IF NOT EXISTS idx_investigation_date ON patient_investigation(test_date);
CREATE INDEX IF NOT EXISTS idx_investigation_category ON patient_investigation(test_category);
