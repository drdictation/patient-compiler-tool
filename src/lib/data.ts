
import { supabase } from './supabase';

export interface PatientDetails {
    id: string;
    normalized_name: string;
    display_name: string;
    identity_verified: boolean;
    notes?: string;
    // Administrative
    date_of_birth?: string | null;
    medicare_number?: string | null;
    address?: string | null;
    ihi_number?: string | null;
    private_health_number?: string | null;
    mobile?: string | null;
    email?: string | null;
    dva_number?: string | null;
    // Clinical
    referring_doctor?: string | null;
    last_encounter_date?: string | null;
    next_recall_date?: string | null;
}

export interface TimelineEncounter {
    id: string;
    encounter_date: string;
    notes?: string;
    source_records: Array<{
        id: string;
        heroku_id: number;
        transcription: string; // The raw text
        ai_formatted_transcription?: string; // The pretty text
        consult_date: string;
        created_at_heroku: string;
    }>;
    artifacts: Array<{
        id: string;
        artifact_type: 'INTERNAL_NOTE' | 'REFERRER_LETTER';
        current_version: number;
        versions: Array<{
            version_number: number;
            content: string;
            created_at: string;
        }>;
    }>;
}

type TimelineSourceRecord = TimelineEncounter['source_records'][number];
type TimelineArtifact = TimelineEncounter['artifacts'][number];

export async function getPatientDetails(id: string) {
    const { data, error } = await supabase
        .from('canonical_patient')
        .select('*')
        .eq('id', id)
        .maybeSingle();

    if (error) throw error;
    return data as PatientDetails | null;
}

export async function getPatientTimeline(patientId: string) {
    // 1. Get all encounters
    const { data: encounters, error: encError } = await supabase
        .from('encounter')
        .select('*')
        .eq('canonical_patient_id', patientId)
        .order('encounter_date', { ascending: false });

    if (encError) throw encError;
    if (!encounters) return [];

    const encounterIds = encounters.map((enc) => enc.id);
    const encounterDates = encounters.map((enc) => enc.encounter_date);

    // 2. Fetch associated data in batch to avoid N+1 round trips.
    const [{ data: records }, { data: artifacts }] = await Promise.all([
        supabase
            .from('source_record_cache')
            .select('*')
            .eq('canonical_patient_id', patientId)
            .in('consult_date', encounterDates),
        supabase
            .from('artifact')
            .select(`
                *,
                versions:artifact_version(*)
            `)
            .in('encounter_id', encounterIds)
    ]);

    const recordsByDate = (records || []).reduce<Record<string, TimelineSourceRecord[]>>((acc, record) => {
        const key = record.consult_date;
        if (!acc[key]) acc[key] = [];
        acc[key].push(record as TimelineSourceRecord);
        return acc;
    }, {});

    const artifactsByEncounter = (artifacts || []).reduce<Record<string, TimelineArtifact[]>>((acc, artifact) => {
        const key = artifact.encounter_id;
        if (!acc[key]) acc[key] = [];
        acc[key].push(artifact as unknown as TimelineArtifact);
        return acc;
    }, {});

    return encounters.map((enc) => ({
        id: enc.id,
        encounter_date: enc.encounter_date,
        notes: enc.notes,
        source_records: recordsByDate[enc.encounter_date] || [],
        artifacts: artifactsByEncounter[enc.id] || []
    }));
}

export interface PatientIssue {
    id: string;
    issue_name: string;
    status: 'active' | 'monitoring' | 'resolved';
    lifecycle_state: 'suggested' | 'accepted' | 'rejected' | 'clinician_entered';
    evidence_quote?: string;
    source_count?: number;
}

export async function getPatientIssues(patientId: string): Promise<PatientIssue[]> {
    const { data, error } = await supabase
        .from('patient_issue')
        .select(`
            *,
            sources:patient_issue_source(count)
        `)
        .eq('canonical_patient_id', patientId)
        .neq('lifecycle_state', 'rejected') // Don't fetch rejected by default
        .order('status', { ascending: true }); // active < monitoring < resolved

    if (error) throw error;

    return data.map((issue) => ({
        ...issue,
        source_count: issue.sources?.[0]?.count || 0
    }));
}

export async function getPatientInvestigations(patientId: string) {
    const { data, error } = await supabase
        .from('patient_investigation')
        .select(`
            id, test_name, test_category, test_date, result_summary, status, next_due_date, lifecycle_state
        `)
        .eq('canonical_patient_id', patientId)
        .order('test_date', { ascending: false });

    if (error) {
        console.error('Error fetching investigations:', error);
        return [];
    }

    return data || [];
}

export async function getPatientInterventions(patientId: string) {
    const { data, error } = await supabase
        .from('patient_intervention')
        .select(`
            id, intervention_name, intervention_type, start_date, end_date, response, response_notes, lifecycle_state
        `)
        .eq('canonical_patient_id', patientId)
        .order('start_date', { ascending: false });

    if (error) {
        console.error('Error fetching interventions:', error);
        return [];
    }

    return data || [];
}

export interface PatientTask {
    id: string;
    task_description: string;
    task_category: 'clinical' | 'administrative' | 'follow_up';
    evidence_quote: string | null;
    status: string;
    lifecycle_state: string;
    confidence: string;
    snoozed_until: string | null;
    created_at: string;
}

export async function getPatientTasks(patientId: string): Promise<PatientTask[]> {
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
        .from('patient_task')
        .select('*')
        .eq('canonical_patient_id', patientId)
        .eq('status', 'pending')
        .or(`snoozed_until.is.null,snoozed_until.lte.${today}`)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching tasks:', error);
        return [];
    }

    return data || [];
}
