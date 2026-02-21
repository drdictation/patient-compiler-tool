-- Performance indexes for common dashboard + patient detail queries.
-- Safe to run multiple times.

CREATE INDEX IF NOT EXISTS idx_encounter_patient_date
ON encounter (canonical_patient_id, encounter_date DESC);

CREATE INDEX IF NOT EXISTS idx_source_record_patient_consult
ON source_record_cache (canonical_patient_id, consult_date);

CREATE INDEX IF NOT EXISTS idx_artifact_encounter
ON artifact (encounter_id);

CREATE INDEX IF NOT EXISTS idx_artifact_version_artifact_version
ON artifact_version (artifact_id, version_number DESC);

CREATE INDEX IF NOT EXISTS idx_patient_issue_patient_lifecycle_status
ON patient_issue (canonical_patient_id, lifecycle_state, status);

CREATE INDEX IF NOT EXISTS idx_patient_investigation_patient_date
ON patient_investigation (canonical_patient_id, test_date DESC);

CREATE INDEX IF NOT EXISTS idx_patient_intervention_patient_date
ON patient_intervention (canonical_patient_id, start_date DESC);

CREATE INDEX IF NOT EXISTS idx_patient_task_pending_lookup
ON patient_task (canonical_patient_id, status, snoozed_until, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_canonical_patient_recall_date
ON canonical_patient (next_recall_date);
