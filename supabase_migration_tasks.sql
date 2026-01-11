-- Migration: Create patient_task table for task management feature
-- Run this in Supabase SQL Editor

-- Create the patient_task table
CREATE TABLE IF NOT EXISTS patient_task (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_patient_id UUID NOT NULL REFERENCES canonical_patient(id) ON DELETE CASCADE,
    
    -- Task Content
    task_description TEXT NOT NULL,
    task_category TEXT NOT NULL DEFAULT 'clinical', -- 'clinical', 'administrative', 'follow_up'
    evidence_quote TEXT,  -- Quote from transcript that generated this task
    
    -- Source Attribution (for AI-generated tasks)
    source_encounter_id UUID REFERENCES encounter(id) ON DELETE SET NULL,
    source_artifact_id UUID REFERENCES artifact(id) ON DELETE SET NULL,
    
    -- Lifecycle
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'completed', 'archived'
    lifecycle_state TEXT NOT NULL DEFAULT 'suggested', -- 'suggested', 'accepted', 'clinician_entered'
    
    -- Snooze/Reminder
    snoozed_until DATE,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    
    -- Confidence (for AI-generated)
    confidence TEXT DEFAULT 'high' -- 'high', 'medium', 'low'
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_patient_task_patient ON patient_task(canonical_patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_task_status ON patient_task(status);
CREATE INDEX IF NOT EXISTS idx_patient_task_snoozed ON patient_task(snoozed_until) WHERE snoozed_until IS NOT NULL;

-- Update the patient_summary view to include pending task count
DROP VIEW IF EXISTS patient_summary;

CREATE VIEW patient_summary AS
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
    COUNT(DISTINCT pint.id) FILTER (WHERE pint.lifecycle_state = 'suggested') as suggested_items_count,
    COUNT(DISTINCT pt.id) FILTER (
        WHERE pt.status = 'pending' 
        AND (pt.snoozed_until IS NULL OR pt.snoozed_until <= CURRENT_DATE)
    ) as pending_task_count
FROM canonical_patient p
LEFT JOIN encounter e ON p.id = e.canonical_patient_id
LEFT JOIN source_record_cache s ON p.id = s.canonical_patient_id
LEFT JOIN patient_issue pi ON p.id = pi.canonical_patient_id
LEFT JOIN patient_investigation pinv ON p.id = pinv.canonical_patient_id
LEFT JOIN patient_intervention pint ON p.id = pint.canonical_patient_id
LEFT JOIN patient_task pt ON p.id = pt.canonical_patient_id
GROUP BY p.id;
