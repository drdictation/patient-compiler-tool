import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { getPatientDetails, getPatientTimeline, getPatientIssues, getPatientInvestigations, getPatientInterventions, getPatientTasks } from '@/lib/data';
import { fetchWithRetryAndTimeout } from '@/lib/llm-request';

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    if (!(await isAuthenticated())) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const { question } = await request.json().catch(() => ({}));

    if (!question || typeof question !== 'string' || !question.trim()) {
        return NextResponse.json({ error: 'Question is required' }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return NextResponse.json({ error: 'Missing OPENAI_API_KEY' }, { status: 500 });
    }

    try {
        const [patient, timeline, issues, investigations, interventions, tasks] = await Promise.all([
            getPatientDetails(id),
            getPatientTimeline(id),
            getPatientIssues(id),
            getPatientInvestigations(id),
            getPatientInterventions(id),
            getPatientTasks(id),
        ]);

        if (!patient) {
            return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
        }

        // Build lean clinical record context
        const contextBlocks: string[] = [];
        contextBlocks.push(`Patient: ${patient.display_name} (DOB: ${patient.date_of_birth || 'Unknown'})`);

        if (issues.length > 0) {
            contextBlocks.push('Issues / Diagnoses:\n' + issues.map(i => `- ${i.issue_name} (${i.status})`).join('\n'));
        }

        if (interventions.length > 0) {
            contextBlocks.push('Interventions / Medications:\n' + interventions.map(i => `- ${i.intervention_name}: ${i.response || 'Unknown status'}${i.response_notes ? ` (${i.response_notes})` : ''}`).join('\n'));
        }

        if (investigations.length > 0) {
            contextBlocks.push('Investigations / Recalls:\n' + investigations.map(i => `- ${i.test_name}: ${i.result_summary || 'No summary'}${i.next_due_date ? ` (Due: ${i.next_due_date})` : ''}`).join('\n'));
        }

        if (tasks.length > 0) {
            contextBlocks.push('Tasks:\n' + tasks.map(t => `- [${t.status}] ${t.task_description}`).join('\n'));
        }

        if (timeline.length > 0) {
            const encounterTexts = timeline.map(enc => {
                const parts: string[] = [`Date: ${enc.encounter_date}`];
                if (enc.notes) parts.push(`Notes: ${enc.notes}`);

                enc.artifacts.forEach(art => {
                    const latest = art.versions.find(v => v.version_number === art.current_version) || art.versions[0];
                    if (latest?.content?.trim()) {
                        parts.push(`${art.artifact_type}: ${latest.content.trim()}`);
                    }
                });

                enc.source_records.forEach(rec => {
                    const text = rec.ai_formatted_transcription || rec.transcription;
                    if (text?.trim()) parts.push(`Dictation: ${text.trim()}`);
                });

                return parts.join('\n');
            });
            contextBlocks.push('Timeline & Consult Encounters:\n' + encounterTexts.join('\n\n---\n\n'));
        }

        const systemInstructions =
            'You are an ultra-concise clinical assistant answering queries on a patient chart. ' +
            'Tone: short and sharp (caveman style). Max 1-3 sentences. ' +
            'Direct facts and dates only. Eliminate filler pleasantries. ' +
            'If information is not in the provided records, say "Not documented in records."';

        const inputPrompt = `Patient Record Context:\n${contextBlocks.join('\n\n')}\n\nQuestion: ${question.trim()}`;

        const body = {
            model: 'gpt-6-luna',
            instructions: systemInstructions,
            input: inputPrompt,
            max_output_tokens: 500
        };

        const res = await fetchWithRetryAndTimeout({
            operation: 'CLINICAL_GENERATION',
            url: 'https://api.openai.com/v1/responses',
            init: {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`
                },
                body: JSON.stringify(body)
            },
            model: 'gpt-6-luna',
            provider: 'openai'
        });

        const data = await res.json() as {
            output_text?: string;
            output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
        };

        const answer = data.output_text || data.output
            ?.flatMap(item => item.content || [])
            .find(item => item.type === 'output_text')?.text || 'No response generated.';

        return NextResponse.json({ answer: answer.trim() });
    } catch (error: any) {
        console.error('[Patient QA Error]', error);
        return NextResponse.json({ error: error.message || 'QA request failed' }, { status: 500 });
    }
}
