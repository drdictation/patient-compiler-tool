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
        isComplex?: boolean;
        pronouns?: 'auto' | 'he_him' | 'she_her' | 'they_them';
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
    artifactType: 'RAW_TRANSCRIPT' | 'INTERNAL_NOTE' | 'REFERRER_LETTER' | 'REFERRAL_LETTER' | 'PATIENT_SUMMARY',
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

const COMPLEXITY_DIRECTIVE = `
CLINICAL COMPLEXITY DIRECTIVE (CRITICAL REQUIREMENT):
This is a highly complex patient consult. The generated letter must reflect this complexity and be significantly more verbose, detailed, and explanatory than a standard summary. You MUST:
1. Elaborate in detail on all physiological, pathological, and pathophysiological pathways discussed during the consultation.
2. Detail any psychosocial complexities influencing the patient's presentation, coping mechanisms, or care plan.
3. Fully capture medicolegal reasoning, discussions, and decision-making regarding investigations (Ix), treatment choices, and potential risks or alternatives discussed.
4. Avoid aggressive summarization; write in an exhaustive, explanatory clinical style to ensure no nuance is lost.
`;

function getPronounDirective(pronouns?: 'auto' | 'he_him' | 'she_her' | 'they_them', patientName?: string): string {
    if (!pronouns || pronouns === 'auto') return '';
    const label = pronouns === 'he_him' ? 'he/him/his/himself' 
                : pronouns === 'she_her' ? 'she/her/hers/herself' 
                : 'they/them/theirs/themselves';
    return `\n\nPRONOUN DIRECTIVE (CRITICAL): When referring to the patient (${patientName || 'the patient'}), you MUST use "${label}" pronouns. Do not guess or use other pronouns under any circumstance. Ensure all sentence structures and verb conjugations (e.g. "they are" vs "he is") are grammatically correct.`;
}

/**
 * Create Smart Note artifacts from a transcript.
 * Handles partial failures - if one generation fails, others still complete.
 * Also extracts tasks from the transcript.
 */
export async function createSmartNote(options: SmartNoteOptions): Promise<SmartNoteResult> {
    const { patientId, patientName, date, transcript, noteType, outputs, model } = options;
    const result: SmartNoteResult = { errors: [] };

    let formattedDate: string | undefined = undefined;
    if (date) {
        try {
            const parts = date.split('-');
            if (parts.length === 3) {
                const year = parts[0];
                const monthIndex = parseInt(parts[1], 10) - 1;
                const day = parseInt(parts[2], 10);
                const monthNames = [
                    "January", "February", "March", "April", "May", "June", 
                    "July", "August", "September", "October", "November", "December"
                ];
                if (monthIndex >= 0 && monthIndex < 12) {
                    formattedDate = `${day} ${monthNames[monthIndex]} ${year}`;
                }
            }
        } catch (e) {
            console.error('Failed to parse date string:', date, e);
        }
        if (!formattedDate) {
            formattedDate = date;
        }
    }

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
                    'smart_note_consult',
                    formattedDate
                );
                result.noteArtifactId = await saveArtifact(encounterId, 'INTERNAL_NOTE', content);
            } catch (e: any) {
                result.errors.push(`Failed to generate note: ${e.message}`);
            }
        }

        if (outputs.generateLetter) {
            try {
                let promptKey = 'NEW_LETTER';
                const type = outputs.letterType || 'review';
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
                let prompt = (PROMPTS as any)[promptKey] || PROMPTS.NEW_LETTER;
                if (outputs.isComplex) {
                    prompt = prompt + "\n\n" + COMPLEXITY_DIRECTIVE;
                }
                if (outputs.pronouns) {
                    prompt = prompt + getPronounDirective(outputs.pronouns, patientName);
                }

                const { content } = await generateFromPrompt(
                    transcript,
                    patientName,
                    prompt,
                    model,
                    patientId,
                    'smart_note_letter',
                    formattedDate
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



// ============ INBOX ACTIONS ============

import { pollInbox, markAsProcessed, suggestPatientMatch } from '@/lib/gmail-inbox';

export interface InboxItem {
    id: string;
    source: string;
    gmail_message_id: string | null;
    sender_email: string | null;
    sender_name: string | null;
    subject: string | null;
    raw_content: string;
    html_content: string | null;
    has_attachments: boolean;
    attachment_count: number;
    ai_suggested_patient_id: string | null;
    ai_suggested_patient_name: string | null;
    ai_confidence: number | null;
    assigned_patient_id: string | null;
    assigned_as: string | null;
    status: string;
    received_at: string;
    created_at: string;
}

/**
 * Fetch all pending inbox items
 */
export async function getPendingInboxItems(): Promise<InboxItem[]> {
    const { data, error } = await supabase
        .from('inbox_item')
        .select('*')
        .eq('status', 'pending')
        .order('received_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data || [];
}

/**
 * Poll Gmail and create new inbox items
 */
export async function pollGmailInbox(): Promise<{ newItems: number; errors: string[] }> {
    const errors: string[] = [];
    let newItems = 0;

    try {
        console.log('Polling Gmail with config:', {
            hasClientId: !!process.env.GMAIL_CLIENT_ID,
            hasClientSecret: !!process.env.GMAIL_CLIENT_SECRET,
            hasRefreshToken: !!process.env.GMAIL_REFRESH_TOKEN,
            clientIdPrefix: process.env.GMAIL_CLIENT_ID?.substring(0, 10)
        });

        // 1. Poll Gmail for new messages
        const messages = await pollInbox('INBOX', 20);

        if (messages.length === 0) {
            return { newItems: 0, errors: [] };
        }

        // 2. Get all patients for AI matching
        const { data: patients } = await supabase
            .from('canonical_patient')
            .select('id, display_name')
            .order('display_name');

        const patientList = patients || [];

        // 3. Process each message
        for (const message of messages) {
            try {
                // Check if already processed (deduplication)
                const { data: existing } = await supabase
                    .from('inbox_item')
                    .select('id')
                    .eq('gmail_message_id', message.gmailMessageId)
                    .single();

                if (existing) {
                    // Already processed, mark as read in Gmail
                    await markAsProcessed(message.gmailMessageId);
                    continue;
                }


                // 4. AI patient suggestion
                let aiSuggestion: { patientId?: string; patientName?: string; confidence?: number } = {};
                if (patientList.length > 0) {
                    try {
                        aiSuggestion = await suggestPatientMatch(
                            message.rawContent,
                            message.subject,
                            patientList
                        );
                    } catch (e) {
                        console.error('AI suggestion failed:', e);
                    }
                }


                // 5. Create inbox item
                const { error: insertError } = await supabase
                    .from('inbox_item')
                    .insert({
                        source: 'email',
                        gmail_message_id: message.gmailMessageId,
                        sender_email: message.senderEmail,
                        sender_name: message.senderName,
                        subject: message.subject,
                        raw_content: message.rawContent,
                        html_content: message.htmlContent,
                        has_attachments: message.hasAttachments,
                        attachment_count: message.attachmentCount,
                        ai_suggested_patient_id: aiSuggestion.patientId,
                        ai_suggested_patient_name: aiSuggestion.patientName,
                        ai_confidence: aiSuggestion.confidence,
                        received_at: message.receivedAt.toISOString(),
                        status: 'pending',
                    });

                if (insertError) {
                    errors.push(`Failed to save message ${message.gmailMessageId}: ${insertError.message}`);
                    continue;
                }

                // 6. Mark as processed in Gmail
                await markAsProcessed(message.gmailMessageId);
                newItems++;

            } catch (e: any) {
                errors.push(`Error processing message: ${e.message}`);
            }
        }

        revalidatePath('/inbox');
        return { newItems, errors };

    } catch (e: any) {
        errors.push(`Gmail polling failed: ${e.message}`);
        return { newItems, errors };
    }
}

/**
 * Assign inbox item to a patient
 */
export async function assignInboxItem(
    itemId: string,
    patientId: string,
    assignAs: 'record' | 'letter' | 'task' | 'smart_note',
    options?: { taskCategory?: string; letterType?: string; date?: string }
): Promise<{ success: boolean; artifactId?: string; error?: string }> {
    try {
        // 1. Get inbox item
        const { data: item, error: fetchError } = await supabase
            .from('inbox_item')
            .select('*')
            .eq('id', itemId)
            .single();

        if (fetchError || !item) {
            return { success: false, error: 'Inbox item not found' };
        }

        // 2. Get patient name
        const { data: patient } = await supabase
            .from('canonical_patient')
            .select('display_name')
            .eq('id', patientId)
            .single();

        const patientName = patient?.display_name || 'Unknown';
        const date = options?.date || new Date().toISOString().split('T')[0];

        let artifactId: string | undefined;

        // 3. Create appropriate artifact/task based on assignAs
        if (assignAs === 'record') {
            // Create as source record
            const encounterId = await ensureEncounter(patientId, date);
            artifactId = await saveArtifact(encounterId, 'RAW_TRANSCRIPT', item.raw_content);

        } else if (assignAs === 'letter') {
            // Create as referrer letter
            const encounterId = await ensureEncounter(patientId, date);
            artifactId = await saveArtifact(encounterId, 'REFERRER_LETTER', item.raw_content);

        } else if (assignAs === 'task') {
            // Create as task
            const category = (options?.taskCategory as 'clinical' | 'administrative' | 'follow_up') || 'clinical';
            const { data: taskData, error: taskError } = await supabase
                .from('patient_task')
                .insert({
                    canonical_patient_id: patientId,
                    task_description: item.raw_content,
                    task_category: category,
                    lifecycle_state: 'clinician_entered',
                    status: 'pending'
                })
                .select('id')
                .single();

            if (taskError) throw new Error(taskError.message);
            artifactId = taskData.id;

        } else if (assignAs === 'smart_note') {
            // This will be handled by opening the Smart Note dialog
            // Just mark as assigned for now
            artifactId = undefined;
        }

        // 4. Update inbox item status
        const { error: updateError } = await supabase
            .from('inbox_item')
            .update({
                assigned_patient_id: patientId,
                assigned_as: assignAs,
                assigned_artifact_id: artifactId,
                status: 'assigned',
                processed_at: new Date().toISOString()
            })
            .eq('id', itemId);

        if (updateError) throw new Error(updateError.message);

        revalidatePath('/inbox');
        revalidatePath('/patient/[id]');
        revalidatePath('/');

        return { success: true, artifactId };

    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

/**
 * Discard inbox item
 */
export async function discardInboxItem(itemId: string): Promise<void> {
    const { error } = await supabase
        .from('inbox_item')
        .update({
            status: 'discarded',
            processed_at: new Date().toISOString()
        })
        .eq('id', itemId);

    if (error) throw new Error(error.message);
    revalidatePath('/inbox');
}

/**
 * Re-run AI patient suggestion
 */
export async function suggestPatientForInboxItem(itemId: string): Promise<{
    patientId?: string;
    patientName?: string;
    confidence?: number;
    error?: string;
}> {
    try {
        // 1. Get inbox item
        const { data: item } = await supabase
            .from('inbox_item')
            .select('raw_content, subject')
            .eq('id', itemId)
            .single();

        if (!item) {
            return { error: 'Inbox item not found' };
        }

        // 2. Get all patients
        const { data: patients } = await supabase
            .from('canonical_patient')
            .select('id, display_name')
            .order('display_name');

        if (!patients || patients.length === 0) {
            return { error: 'No patients available' };
        }

        // 3. Run AI suggestion
        const suggestion = await suggestPatientMatch(
            item.raw_content,
            item.subject || '',
            patients
        );

        // 4. Update inbox item
        if (suggestion.patientId) {
            await supabase
                .from('inbox_item')
                .update({
                    ai_suggested_patient_id: suggestion.patientId,
                    ai_suggested_patient_name: suggestion.patientName,
                    ai_confidence: suggestion.confidence
                })
                .eq('id', itemId);

            revalidatePath('/inbox');
        }

        return suggestion;

    } catch (e: any) {
        return { error: e.message };
    }
}

/**
 * Fetch the latest version content of a patient's note or letter.
 */
export async function getLatestPatientArtifact(
    patientId: string,
    artifactType: 'INTERNAL_NOTE' | 'REFERRER_LETTER'
): Promise<string | null> {
    try {
        // 1. Get the latest encounter date for this patient
        const { data: latestEncounter, error: encError } = await supabase
            .from('encounter')
            .select('id')
            .eq('canonical_patient_id', patientId)
            .order('encounter_date', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (encError || !latestEncounter) return null;

        // 2. Get the artifact of specified type for this encounter
        const { data: artifact, error: artError } = await supabase
            .from('artifact')
            .select('id, current_version')
            .eq('encounter_id', latestEncounter.id)
            .eq('artifact_type', artifactType)
            .maybeSingle();

        if (artError || !artifact) return null;

        // 3. Get the content of the current version of this artifact
        const { data: version, error: verError } = await supabase
            .from('artifact_version')
            .select('content')
            .eq('artifact_id', artifact.id)
            .eq('version_number', artifact.current_version)
            .maybeSingle();

        if (verError || !version) return null;

        return version.content;
    } catch (e) {
        console.error('Failed to get latest patient artifact:', e);
        return null;
    }
}

export interface AdditionalDocumentOptions {
    patientId: string;
    encounterId: string;
    documentType: 'referral_letter' | 'patient_summary';
    clinicianType?: string;
    additionalContext?: string;
    includePatientHistory: boolean;
    model: SmartNoteModel;
    isComplex?: boolean;
    pronouns?: 'auto' | 'he_him' | 'she_her' | 'they_them';
}

/**
 * Generates an outbound referral letter or a patient summary from a consult's transcripts/notes,
 * with an option to include the history from up to 3 past consults for context.
 */
export async function generateAdditionalDocument(
    options: AdditionalDocumentOptions
): Promise<{ success: boolean; artifactId?: string; error?: string }> {
    const { patientId, encounterId, documentType, clinicianType, additionalContext, includePatientHistory, model, isComplex, pronouns } = options;
    try {
        // 1. Fetch patient display name
        const { data: patient } = await supabase
            .from('canonical_patient')
            .select('display_name')
            .eq('id', patientId)
            .single();

        const patientName = patient?.display_name || 'Unknown Patient';

        // 2. Fetch the target encounter and existing records
        const { data: encounter } = await supabase
            .from('encounter')
            .select('*')
            .eq('id', encounterId)
            .single();

        if (!encounter) {
            return { success: false, error: 'Encounter not found' };
        }

        let formattedDate: string = encounter.encounter_date;
        try {
            const parts = encounter.encounter_date.split('-');
            if (parts.length === 3) {
                const year = parts[0];
                const monthIndex = parseInt(parts[1], 10) - 1;
                const day = parseInt(parts[2], 10);
                const monthNames = [
                    "January", "February", "March", "April", "May", "June", 
                    "July", "August", "September", "October", "November", "December"
                ];
                if (monthIndex >= 0 && monthIndex < 12) {
                    formattedDate = `${day} ${monthNames[monthIndex]} ${year}`;
                }
            }
        } catch (e) {
            console.error('Failed to parse encounter date:', encounter.encounter_date, e);
        }

        // Fetch current encounter artifacts
        const { data: currentArtifacts } = await supabase
            .from('artifact')
            .select(`
                *,
                versions:artifact_version(*)
            `)
            .eq('encounter_id', encounterId);

        // Fetch current encounter source records
        const { data: sourceRecords } = await supabase
            .from('source_record_cache')
            .select('*')
            .eq('canonical_patient_id', patientId)
            .eq('consult_date', encounter.encounter_date);

        // 3. Compile current consult details
        let consultDetails = '';
        const transcriptArt = currentArtifacts?.find(a => a.artifact_type === 'RAW_TRANSCRIPT');
        if (transcriptArt) {
            const latest = transcriptArt.versions.find((v: any) => v.version_number === transcriptArt.current_version) || transcriptArt.versions[0];
            if (latest?.content) {
                consultDetails += `Consult Transcript:\n${latest.content}\n\n`;
            }
        }

        const noteArt = currentArtifacts?.find(a => a.artifact_type === 'INTERNAL_NOTE');
        if (noteArt) {
            const latest = noteArt.versions.find((v: any) => v.version_number === noteArt.current_version) || noteArt.versions[0];
            if (latest?.content) {
                consultDetails += `Consult Note:\n${latest.content}\n\n`;
            }
        }

        const letterArt = currentArtifacts?.find(a => a.artifact_type === 'REFERRER_LETTER');
        if (letterArt) {
            const latest = letterArt.versions.find((v: any) => v.version_number === letterArt.current_version) || letterArt.versions[0];
            if (latest?.content) {
                consultDetails += `Referrer Letter:\n${latest.content}\n\n`;
            }
        }

        if (sourceRecords && sourceRecords.length > 0) {
            consultDetails += `Source Dictations:\n`;
            sourceRecords.forEach((r: any) => {
                if (r.transcription) {
                    consultDetails += `- ${r.transcription}\n`;
                }
            });
        }

        if (!consultDetails.trim()) {
            consultDetails = 'No consult text or transcript is currently saved for this encounter.';
        }

        // 4. Compile patient history if requested (max 3 past consult entries)
        let historyText = 'No previous consult history was requested or available.';
        if (includePatientHistory) {
            const { data: pastEncounters } = await supabase
                .from('encounter')
                .select('id, encounter_date')
                .eq('canonical_patient_id', patientId)
                .neq('id', encounterId)
                .order('encounter_date', { ascending: false })
                .limit(3);

            if (pastEncounters && pastEncounters.length > 0) {
                const pastEncounterIds = pastEncounters.map(e => e.id);
                const { data: pastArtifacts } = await supabase
                    .from('artifact')
                    .select(`
                        id,
                        encounter_id,
                        artifact_type,
                        current_version,
                        versions:artifact_version(*)
                    `)
                    .in('encounter_id', pastEncounterIds)
                    .in('artifact_type', ['INTERNAL_NOTE', 'REFERRER_LETTER', 'REFERRAL_LETTER']);

                if (pastArtifacts && pastArtifacts.length > 0) {
                    const formattedPast = pastEncounters.map(enc => {
                        const dateStr = new Date(enc.encounter_date).toLocaleDateString('en-AU', {
                            day: 'numeric', month: 'short', year: 'numeric'
                        });
                        const encArts = pastArtifacts.filter(a => a.encounter_id === enc.id);
                        if (encArts.length === 0) return '';

                        let encText = `Consult on ${dateStr}:\n`;
                        encArts.forEach(art => {
                            const latest = art.versions.find((v: any) => v.version_number === art.current_version) || art.versions[0];
                            if (latest?.content) {
                                const typeLabel = art.artifact_type === 'INTERNAL_NOTE' ? 'Consult Note'
                                    : art.artifact_type === 'REFERRER_LETTER' ? 'Referrer Letter'
                                    : 'Referral Letter (Outbound)';
                                encText += `[${typeLabel}]\n${latest.content}\n`;
                            }
                        });
                        return encText;
                    }).filter(Boolean).join('\n---\n\n');

                    if (formattedPast.trim()) {
                        historyText = formattedPast;
                    }
                }
            }
        }

        // 5. Select prompt and replace fields
        let promptTemplate = '';
        let targetArtifactType: 'REFERRAL_LETTER' | 'PATIENT_SUMMARY';

        if (documentType === 'referral_letter') {
            const { OUTBOUND_REFERRAL_LETTER } = await import('@/lib/prompts/outbound-referral-letter');
            let template = OUTBOUND_REFERRAL_LETTER;
            if (isComplex) {
                template = template + "\n\n" + COMPLEXITY_DIRECTIVE;
            }
            if (pronouns) {
                template = template + getPronounDirective(pronouns, patientName);
            }
            promptTemplate = template
                .replaceAll('{{CLINICIAN_TYPE}}', clinicianType || 'Specialist')
                .replaceAll('{{PATIENT_HISTORY}}', historyText);
            targetArtifactType = 'REFERRAL_LETTER';
        } else {
            const { PATIENT_SUMMARY } = await import('@/lib/prompts/patient-summary');
            promptTemplate = PATIENT_SUMMARY;
            targetArtifactType = 'PATIENT_SUMMARY';
        }

        const fullPrompt = promptTemplate
            .replaceAll('{{PATIENT_NAME}}', patientName)
            .replaceAll('{{TRANSCRIPT}}', consultDetails)
            .replaceAll('{{ADDITIONAL_CONTEXT}}', additionalContext || 'None provided.');

        // 6. Generate content via Gemini
        const { content } = await generateFromPrompt(
            consultDetails,
            patientName,
            fullPrompt,
            model,
            patientId,
            `additional_doc_${documentType}`,
            formattedDate
        );

        if (!content) {
            return { success: false, error: 'Model generated empty content.' };
        }

        // 7. Save artifact
        const artifactId = await saveArtifact(encounterId, targetArtifactType, content);

        revalidatePath('/patient/[id]');
        revalidatePath('/');

        return { success: true, artifactId };
    } catch (err: any) {
        console.error('Failed to generate additional document:', err);
        return { success: false, error: err.message || 'Generation failed' };
    }
}
