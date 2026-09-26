-- Migration: Performance Optimizations
-- 1. Replace catastrophic Cartesian product in patient_summary view with correlated scalar subqueries
-- 2. Add pg_trgm GIN indexes for sub-millisecond patient and doctor search
-- 3. Add get_llm_cost_summary RPC function to aggregate metrics in Postgres rather than Node.js

-- 1. Optimized patient_summary view (Eliminates 6-way Cartesian cross product)
DROP VIEW IF EXISTS patient_summary;

CREATE VIEW patient_summary AS
SELECT 
    p.id,
    p.display_name,
    p.normalized_name,
    p.identity_verified,
    (
        SELECT MAX(e.encounter_date) 
        FROM encounter e 
        WHERE e.canonical_patient_id = p.id
    ) AS last_seen,
    p.referring_doctor,
    p.next_recall_date,
    (
        SELECT COUNT(*)::INTEGER 
        FROM encounter e 
        WHERE e.canonical_patient_id = p.id
    ) AS encounter_count,
    (
        SELECT COUNT(*)::INTEGER 
        FROM source_record_cache s 
        WHERE s.canonical_patient_id = p.id
    ) AS record_count,
    (
        COALESCE((SELECT COUNT(*)::INTEGER FROM patient_issue pi WHERE pi.canonical_patient_id = p.id AND pi.lifecycle_state = 'suggested'), 0) + 
        COALESCE((SELECT COUNT(*)::INTEGER FROM patient_investigation pinv WHERE pinv.canonical_patient_id = p.id AND pinv.lifecycle_state = 'suggested'), 0) +
        COALESCE((SELECT COUNT(*)::INTEGER FROM patient_intervention pint WHERE pint.canonical_patient_id = p.id AND pint.lifecycle_state = 'suggested'), 0)
    ) AS suggested_items_count,
    (
        SELECT COUNT(*)::INTEGER 
        FROM patient_task pt 
        WHERE pt.canonical_patient_id = p.id 
          AND pt.status = 'pending' 
          AND (pt.snoozed_until IS NULL OR pt.snoozed_until <= CURRENT_DATE)
    ) AS pending_task_count
FROM canonical_patient p;

-- 2. Trigram search indexes for ILIKE '%query%' operations
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_canonical_patient_display_name_trgm 
ON canonical_patient USING gin (display_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_canonical_patient_normalized_name_trgm 
ON canonical_patient USING gin (normalized_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_canonical_patient_referring_doctor_trgm 
ON canonical_patient USING gin (referring_doctor gin_trgm_ops);

-- 3. SQL aggregation RPC function for LLM telemetry (Zero network transfer of individual records)
CREATE OR REPLACE FUNCTION get_llm_cost_summary(start_date TIMESTAMPTZ)
RETURNS TABLE (
    total_cost NUMERIC,
    call_count BIGINT
) 
LANGUAGE sql 
STABLE
AS $$
    SELECT 
        COALESCE(SUM(cost_usd), 0)::NUMERIC AS total_cost,
        COUNT(*)::BIGINT AS call_count
    FROM llm_calls 
    WHERE created_at >= start_date;
$$;
