'use server';

import { supabase } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';
import { PatientDetails } from '@/lib/data';

// ============ CREATE PATIENT ============

export async function createPatient(displayName: string): Promise<{ id: string }> {
    const normalizedName = displayName.toLowerCase().trim().replace(/\s+/g, ' ');

    const { data, error } = await supabase
        .from('canonical_patient')
        .insert({
            display_name: displayName.trim(),
            normalized_name: normalizedName,
            identity_verified: false
        })
        .select('id')
        .single();

    if (error) throw new Error(error.message);

    revalidatePath('/');
    return { id: data.id };
}

export async function updatePatientDetails(patientId: string, updates: Partial<PatientDetails>) {
    // Remove id from updates if present to avoid PK update error
    const { id, ...safeUpdates } = updates;

    const { error } = await supabase
        .from('canonical_patient')
        .update(safeUpdates)
        .eq('id', patientId);

    if (error) throw new Error(error.message);
    revalidatePath('/patient/[id]');
}

export async function updateIssueState(issueId: string, newState: string) {
    const { error } = await supabase
        .from('patient_issue')
        .update({ lifecycle_state: newState })
        .eq('id', issueId);

    if (error) throw new Error(error.message);
    revalidatePath('/patient/[id]');
}

export async function updateIssueStatus(issueId: string, newStatus: string) {
    const { error } = await supabase
        .from('patient_issue')
        .update({ status: newStatus })
        .eq('id', issueId);

    if (error) throw new Error(error.message);
    revalidatePath('/patient/[id]');
}

export async function createManualIssue(patientId: string, name: string, status: string = 'active') {
    const key = name.toLowerCase().trim();
    const { error } = await supabase
        .from('patient_issue')
        .insert({
            canonical_patient_id: patientId,
            issue_name: name,
            issue_key: key,
            status,
            lifecycle_state: 'clinician_entered'
        });

    if (error) throw new Error(error.message);
    revalidatePath('/patient/[id]');
}

export async function updateInvestigationState(id: string, newState: string) {
    const { error } = await supabase
        .from('patient_investigation')
        .update({ lifecycle_state: newState })
        .eq('id', id);

    if (error) throw new Error(error.message);
    revalidatePath('/patient/[id]');
}

export async function updateInterventionState(id: string, newState: string) {
    const { error } = await supabase
        .from('patient_intervention')
        .update({ lifecycle_state: newState })
        .eq('id', id);

    if (error) throw new Error(error.message);
    revalidatePath('/patient/[id]');
}

// ============ CREATE MANUAL ENTRIES ============

export async function createManualInvestigation(
    patientId: string,
    testName: string,
    testCategory: string = 'Blood',
    testDate: string | null = null,
    resultSummary: string = '',
    status: string = 'Completed'
) {
    const { error } = await supabase
        .from('patient_investigation')
        .insert({
            canonical_patient_id: patientId,
            test_name: testName,
            test_category: testCategory,
            test_date: testDate,
            result_summary: resultSummary,
            status,
            lifecycle_state: 'clinician_entered'
        });

    if (error) throw new Error(error.message);
    revalidatePath('/patient/[id]');
}

export async function createManualIntervention(
    patientId: string,
    interventionName: string,
    interventionType: string = 'Medication',
    startDate: string | null = null,
    response: string = 'Ongoing'
) {
    const { error } = await supabase
        .from('patient_intervention')
        .insert({
            canonical_patient_id: patientId,
            intervention_name: interventionName,
            intervention_type: interventionType,
            start_date: startDate,
            response,
            lifecycle_state: 'clinician_entered'
        });

    if (error) throw new Error(error.message);
    revalidatePath('/patient/[id]');
}

// ============ DELETE ACTIONS ============

export async function deleteIssue(issueId: string) {
    // First delete any source references
    await supabase
        .from('patient_issue_source')
        .delete()
        .eq('patient_issue_id', issueId);

    const { error } = await supabase
        .from('patient_issue')
        .delete()
        .eq('id', issueId);

    if (error) throw new Error(error.message);
    revalidatePath('/patient/[id]');
}

export async function deleteInvestigation(id: string) {
    const { error } = await supabase
        .from('patient_investigation')
        .delete()
        .eq('id', id);

    if (error) throw new Error(error.message);
    revalidatePath('/patient/[id]');
}

export async function deleteIntervention(id: string) {
    const { error } = await supabase
        .from('patient_intervention')
        .delete()
        .eq('id', id);

    if (error) throw new Error(error.message);
    revalidatePath('/patient/[id]');
}

// ============ UPDATE ACTIONS ============

export async function updateIssue(issueId: string, updates: { issue_name?: string; status?: string }) {
    const { error } = await supabase
        .from('patient_issue')
        .update(updates)
        .eq('id', issueId);

    if (error) throw new Error(error.message);
    revalidatePath('/patient/[id]');
}

export async function updateInvestigation(id: string, updates: {
    test_name?: string;
    status?: string;
    next_due_date?: string | null;
    result_summary?: string;
}) {
    const { error } = await supabase
        .from('patient_investigation')
        .update(updates)
        .eq('id', id);

    if (error) throw new Error(error.message);
    revalidatePath('/patient/[id]');
}

export async function updateIntervention(id: string, updates: {
    intervention_name?: string;
    response?: string;
    response_notes?: string;
}) {
    const { error } = await supabase
        .from('patient_intervention')
        .update(updates)
        .eq('id', id);

    if (error) throw new Error(error.message);
    revalidatePath('/patient/[id]');
}

// ============ MANUAL NOTE CREATION ============

export async function createManualNote(
    patientId: string,
    date: string, // YYYY-MM-DD format
    noteType: 'INTERNAL_NOTE' | 'REFERRER_LETTER',
    content: string
) {
    // 1. Check if encounter exists for this date
    const { data: existingEncounter } = await supabase
        .from('encounter')
        .select('id')
        .eq('canonical_patient_id', patientId)
        .eq('encounter_date', date)
        .single();

    let encounterId: string;

    if (existingEncounter) {
        encounterId = existingEncounter.id;
    } else {
        // 2. Create new encounter
        const { data: newEncounter, error: encError } = await supabase
            .from('encounter')
            .insert({
                canonical_patient_id: patientId,
                encounter_date: date,
            })
            .select('id')
            .single();

        if (encError) throw new Error(encError.message);
        encounterId = newEncounter.id;
    }

    // 3. Check if artifact of this type exists for this encounter
    const { data: existingArtifact } = await supabase
        .from('artifact')
        .select('id, current_version')
        .eq('encounter_id', encounterId)
        .eq('artifact_type', noteType)
        .single();

    if (existingArtifact) {
        // 4a. Add new version to existing artifact
        const newVersion = existingArtifact.current_version + 1;

        await supabase
            .from('artifact_version')
            .insert({
                artifact_id: existingArtifact.id,
                version_number: newVersion,
                content: content,
            });

        await supabase
            .from('artifact')
            .update({ current_version: newVersion })
            .eq('id', existingArtifact.id);
    } else {
        // 4b. Create new artifact with version 1
        const { data: newArtifact, error: artError } = await supabase
            .from('artifact')
            .insert({
                encounter_id: encounterId,
                artifact_type: noteType,
                current_version: 1,
            })
            .select('id')
            .single();

        if (artError) throw new Error(artError.message);

        await supabase
            .from('artifact_version')
            .insert({
                artifact_id: newArtifact.id,
                version_number: 1,
                content: content,
            });
    }

    revalidatePath('/patient/[id]');
}


// ============ TASK ACTIONS ============

export interface TaskWithPatient {
    id: string;
    task_description: string;
    task_category: 'clinical' | 'administrative' | 'follow_up';
    evidence_quote: string | null;
    status: string;
    lifecycle_state: string;
    confidence: string;
    snoozed_until: string | null;
    created_at: string;
    patient_id: string;
    patient_name: string;
}

/**
 * Create a manual task for a patient
 */
export async function createManualTask(
    patientId: string,
    description: string,
    category: 'clinical' | 'administrative' | 'follow_up' = 'clinical'
) {
    const { error } = await supabase
        .from('patient_task')
        .insert({
            canonical_patient_id: patientId,
            task_description: description,
            task_category: category,
            lifecycle_state: 'clinician_entered',
            status: 'pending'
        });

    if (error) throw new Error(error.message);
    revalidatePath('/patient/[id]');
    revalidatePath('/');
}

/**
 * Mark a task as completed (hides from view)
 */
export async function completeTask(taskId: string) {
    const { error } = await supabase
        .from('patient_task')
        .update({
            status: 'completed',
            completed_at: new Date().toISOString()
        })
        .eq('id', taskId);

    if (error) throw new Error(error.message);
    revalidatePath('/patient/[id]');
    revalidatePath('/');
}

/**
 * Snooze a task for N days
 */
export async function snoozeTask(taskId: string, days: number) {
    const snoozeDate = new Date();
    snoozeDate.setDate(snoozeDate.getDate() + days);

    const { error } = await supabase
        .from('patient_task')
        .update({ snoozed_until: snoozeDate.toISOString().split('T')[0] })
        .eq('id', taskId);

    if (error) throw new Error(error.message);
    revalidatePath('/patient/[id]');
    revalidatePath('/');
}

/**
 * Update a task's description or category
 */
export async function updateTask(taskId: string, updates: {
    task_description?: string;
    task_category?: string;
}) {
    const { error } = await supabase
        .from('patient_task')
        .update(updates)
        .eq('id', taskId);

    if (error) throw new Error(error.message);
    revalidatePath('/patient/[id]');
    revalidatePath('/');
}

/**
 * Delete a task
 */
export async function deleteTask(taskId: string) {
    const { error } = await supabase
        .from('patient_task')
        .delete()
        .eq('id', taskId);

    if (error) throw new Error(error.message);
    revalidatePath('/patient/[id]');
    revalidatePath('/');
}

/**
 * Fetch all pending tasks across all patients
 * Returns tasks sorted by creation date (newest first)
 * Excludes snoozed tasks until their snooze date
 */
export async function getPendingTasks(): Promise<TaskWithPatient[]> {
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
        .from('patient_task')
        .select(`
            id,
            task_description,
            task_category,
            evidence_quote,
            status,
            lifecycle_state,
            confidence,
            snoozed_until,
            created_at,
            canonical_patient_id,
            canonical_patient:canonical_patient_id (display_name)
        `)
        .eq('status', 'pending')
        .or(`snoozed_until.is.null,snoozed_until.lte.${today}`)
        .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    return (data || []).map((task: any) => ({
        id: task.id,
        task_description: task.task_description,
        task_category: task.task_category,
        evidence_quote: task.evidence_quote,
        status: task.status,
        lifecycle_state: task.lifecycle_state,
        confidence: task.confidence,
        snoozed_until: task.snoozed_until,
        created_at: task.created_at,
        patient_id: task.canonical_patient_id,
        patient_name: task.canonical_patient?.display_name || 'Unknown'
    }));
}

/**
 * Fetch pending tasks for a specific patient
 */
export async function getPatientTasks(patientId: string) {
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
        .from('patient_task')
        .select('*')
        .eq('canonical_patient_id', patientId)
        .eq('status', 'pending')
        .or(`snoozed_until.is.null,snoozed_until.lte.${today}`)
        .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data || [];
}

// ============ SMART NOTE CREATION ============

import { generateFromPrompt, SmartNoteModel, extractTasks } from '@/lib/llm';
import { PROMPTS } from '@/lib/prompts';

export interface SmartNoteOptions {
    patientId: string;
    date: string; // YYYY-MM-DD
    transcript: string;
    patientName: string;
    noteType: 'new_consult' | 'review_consult';
    outputs: {
        generateNote: boolean;
        generateLetter: boolean;
        letterType?: 'new' | 'review';
        templateType?: 'general' | 'ibd' | 'functional' | 'oesophageal' | 'eoe';
    };
    model: SmartNoteModel;
}

export interface SmartNoteResult {
    transcriptArtifactId?: string;
    noteArtifactId?: string;
    letterArtifactId?: string;
    tasksExtracted?: number;
    errors: string[];
}

/**
 * Helper to ensure encounter exists for a date
 */
async function ensureEncounter(patientId: string, date: string): Promise<string> {
    const { data: existing } = await supabase
        .from('encounter')
        .select('id')
        .eq('canonical_patient_id', patientId)
        .eq('encounter_date', date)
        .single();

    if (existing) return existing.id;

    const { data: newEnc, error } = await supabase
        .from('encounter')
        .insert({ canonical_patient_id: patientId, encounter_date: date })
        .select('id')
        .single();

    if (error) throw new Error(error.message);
    return newEnc.id;
}

/**
 * Helper to create or update an artifact
 */
async function saveArtifact(
    encounterId: string,
    artifactType: 'RAW_TRANSCRIPT' | 'INTERNAL_NOTE' | 'REFERRER_LETTER',
    content: string
): Promise<string> {
    // Check for existing artifact
    const { data: existing } = await supabase
        .from('artifact')
        .select('id, current_version')
        .eq('encounter_id', encounterId)
        .eq('artifact_type', artifactType)
        .single();

    if (existing) {
        const newVersion = existing.current_version + 1;
        await supabase.from('artifact_version').insert({
            artifact_id: existing.id,
            version_number: newVersion,
            content
        });
        await supabase.from('artifact').update({ current_version: newVersion }).eq('id', existing.id);
        return existing.id;
    }

    // Create new artifact
    const { data: newArt, error } = await supabase
        .from('artifact')
        .insert({ encounter_id: encounterId, artifact_type: artifactType, current_version: 1 })
        .select('id')
        .single();

    if (error) throw new Error(error.message);

    await supabase.from('artifact_version').insert({
        artifact_id: newArt.id,
        version_number: 1,
        content
    });

    return newArt.id;
}

/**
 * Create Smart Note artifacts from a transcript.
 * Handles partial failures - if one generation fails, others still complete.
 * Also extracts tasks from the transcript.
 */
export async function createSmartNote(options: SmartNoteOptions): Promise<SmartNoteResult> {
    const { patientId, patientName, date, transcript, noteType, outputs, model } = options;
    const result: SmartNoteResult = { errors: [] };

    try {
        // 1. Ensure encounter exists
        const encounterId = await ensureEncounter(patientId, date);

        // 2. Save raw transcript
        try {
            result.transcriptArtifactId = await saveArtifact(encounterId, 'RAW_TRANSCRIPT', transcript);
        } catch (e: any) {
            result.errors.push(`Failed to save transcript: ${e.message}`);
        }

        // 3. Generate Consult Note if requested
        if (outputs.generateNote) {
            try {
                const promptKey = noteType === 'new_consult' ? 'NEW_CONSULT_NOTE' : 'REVIEW_CONSULT_NOTE';
                const prompt = PROMPTS[promptKey];

                const { content } = await generateFromPrompt(
                    transcript,
                    patientName,
                    prompt,
                    model, // Use user-selected model
                    patientId,
                    'smart_note_consult'
                );
                result.noteArtifactId = await saveArtifact(encounterId, 'INTERNAL_NOTE', content);
            } catch (e: any) {
                result.errors.push(`Failed to generate note: ${e.message}`);
            }
        }

        if (outputs.generateLetter) {
            try {
                let promptKey = 'NEW_LETTER';
                const type = outputs.letterType || 'new';
                const template = outputs.templateType || 'general';

                if (template === 'general') {
                    promptKey = type === 'review' ? 'REVIEW_LETTER' : 'NEW_LETTER';
                } else if (template === 'ibd') {
                    promptKey = type === 'review' ? 'IBD_REVIEW_LETTER' : 'IBD_NEW_LETTER';
                } else if (template === 'functional') {
                    promptKey = type === 'review' ? 'FUNCTIONAL_REVIEW_LETTER' : 'FUNCTIONAL_NEW_LETTER';
                } else if (template === 'oesophageal') {
                    // Use Functional Review for Oesophageal Review
                    promptKey = type === 'review' ? 'FUNCTIONAL_REVIEW_LETTER' : 'OESOPHAGEAL_NEW_LETTER';
                } else if (template === 'eoe') {
                    // Use Functional Review for EoE Review
                    promptKey = type === 'review' ? 'FUNCTIONAL_REVIEW_LETTER' : 'EOE_NEW_LETTER';
                }

                // @ts-ignore - access dynamically
                const prompt = (PROMPTS as any)[promptKey] || PROMPTS.NEW_LETTER;

                const { content } = await generateFromPrompt(
                    transcript,
                    patientName,
                    prompt,
                    model,
                    patientId,
                    'smart_note_letter'
                );
                result.letterArtifactId = await saveArtifact(encounterId, 'REFERRER_LETTER', content);
            } catch (e: any) {
                result.errors.push(`Failed to generate letter: ${e.message}`);
            }
        }

        // 5. Extract Tasks (always runs)
        try {
            // Enforced model for Tasks (Groq Llama Maverick)
            const taskResult = await extractTasks(transcript, patientName, 'groq-llama-4', patientId);

            // Save each extracted task to the database
            for (const task of taskResult.tasks) {
                await supabase.from('patient_task').insert({
                    canonical_patient_id: patientId,
                    task_description: task.task_description,
                    task_category: task.task_category,
                    evidence_quote: task.evidence_quote,
                    confidence: task.confidence,
                    source_encounter_id: encounterId,
                    source_artifact_id: result.transcriptArtifactId,
                    lifecycle_state: 'suggested',
                    status: 'pending'
                });
            }

            result.tasksExtracted = taskResult.tasks.length;
        } catch (e: any) {
            result.errors.push(`Task extraction failed: ${e.message}`);
        }

        revalidatePath('/patient/[id]');
        revalidatePath('/');
        return result;

    } catch (e: any) {
        result.errors.push(`Smart Note creation failed: ${e.message}`);
        return result;
    }
}

export async function getLLMCostStats(period: 'day' | 'week' | 'month' = 'day') {
    const now = new Date();
    let startDate = new Date();

    if (period === 'day') startDate.setHours(0, 0, 0, 0); // Start of today
    if (period === 'week') startDate.setDate(now.getDate() - 7);
    if (period === 'month') startDate.setDate(now.getDate() - 30);

    const { data, error } = await supabase
        .from('llm_calls')
        .select('cost_usd, tokens_in, tokens_out')
        .gte('created_at', startDate.toISOString());

    if (error) {
        console.error('Error fetching cost stats:', error);
        return { totalCost: 0, count: 0, periodLabel: 'Error' };
    }

    const totalCost = data.reduce((acc, curr) => acc + (curr.cost_usd || 0), 0);
    return {
        totalCost,
        count: data.length,
        periodLabel: period === 'day' ? 'Today' : (period === 'week' ? 'Last 7 Days' : 'Last 30 Days')
    };
}

// ============ TRANSCRIPTION ACTION ============

/**
 * Transcribe audio using Groq Whisper API via Server Action.
 * This bypasses the Route Handler body size limit of 4.5MB.
 */
export async function transcribeAudioAction(formData: FormData): Promise<{ transcript: string; duration: number | null }> {
    try {
        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) {
            throw new Error('GROQ_API_KEY not configured');
        }

        const audioFile = formData.get('file') as File | null;
        if (!audioFile) {
            throw new Error('No audio file provided');
        }

        // Prepare form data for Groq API
        const groqFormData = new FormData();
        groqFormData.append('file', audioFile);
        groqFormData.append('model', 'whisper-large-v3');

        // Call Groq Whisper API
        const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`
            },
            body: groqFormData
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Groq Whisper API error:', {
                status: response.status,
                statusText: response.statusText,
                body: errorText
            });

            // Try to parse error message
            let errorMessage = `Transcription failed (${response.status})`;
            try {
                const errorJson = JSON.parse(errorText);
                if (errorJson.error?.message) {
                    errorMessage = errorJson.error.message;
                }
            } catch {
                if (errorText.length < 200) {
                    errorMessage = errorText;
                }
            }
            throw new Error(errorMessage);
        }

        const data = await response.json();

        return {
            transcript: data.text || '',
            duration: data.duration || null
        };

    } catch (error: any) {
        console.error('Transcription action error:', error);
        throw new Error(error.message || 'Internal error during transcription');
    }
}
