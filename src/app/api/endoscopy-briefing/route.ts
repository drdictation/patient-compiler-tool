import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { getPatientTimeline, getPatientIssues, getPatientInvestigations, getPatientInterventions, getPatientDetails } from '@/lib/data';

export const maxDuration = 120; // 2 minutes to process batch list

export async function POST(request: Request) {
    try {
        if (!(await isAuthenticated())) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
        }

        const { patientIds } = await request.json();
        if (!patientIds || !Array.isArray(patientIds) || patientIds.length === 0) {
            return NextResponse.json({ error: 'No patient IDs provided' }, { status: 400 });
        }

        // Fetch histories for all requested patients in parallel
        const patientHistories = await Promise.all(
            patientIds.map(async (id) => {
                const [details, timeline, issues, investigations, interventions] = await Promise.all([
                    getPatientDetails(id),
                    getPatientTimeline(id),
                    getPatientIssues(id),
                    getPatientInvestigations(id),
                    getPatientInterventions(id)
                ]);

                if (!details) return null;

                // Format timeline into simple prose
                const timelineStr = timeline.map(enc => {
                    const notes = enc.notes || '';
                    const versionNotes = enc.artifacts
                        .map(a => a.versions.map(v => v.content).join('\n'))
                        .join('\n');
                    return `Date: ${enc.encounter_date}\nNotes:\n${notes}\n${versionNotes}`;
                }).join('\n\n');

                const issuesStr = issues.map(i => `- ${i.issue_name} (Status: ${i.status}, Lifecycle: ${i.lifecycle_state})`).join('\n');
                const investigationsStr = investigations.map(i => `- ${i.test_name} (${i.test_category}, Date: ${i.test_date || 'Unknown'}, Result: ${i.result_summary || 'None'})`).join('\n');
                const interventionsStr = interventions.map(i => `- ${i.intervention_name} (${i.intervention_type}, Response: ${i.response || 'None'})`).join('\n');

                return {
                    name: details.display_name,
                    referringDoctor: details.referring_doctor || 'Unknown',
                    history: `
=========================================
PATIENT NAME: ${details.display_name}
REFERRING DOCTOR: ${details.referring_doctor || 'Unknown'}
DOB: ${details.date_of_birth || 'Unknown'}

ACTIVE CLINICAL ISSUES:
${issuesStr || 'None'}

INVESTIGATIONS & SURVEILLANCE:
${investigationsStr || 'None'}

INTERVENTIONS TRIED:
${interventionsStr || 'None'}

ENCOUNTER TIMELINE HISTORY:
${timelineStr || 'None'}
=========================================
`
                };
            })
        );

        const validHistories = patientHistories.filter(Boolean);
        if (validHistories.length === 0) {
            return NextResponse.json({ error: 'No valid patients found' }, { status: 404 });
        }

        const consolidatedHistoryText = validHistories.map(p => p?.history).join('\n\n');

        const systemPrompt = `
You are an expert gastroenterologist clinical lead.
You are preparing a unified, highly optimized briefing sheet for an upcoming **Endoscopy/Scope List**.
Below is the medical history, previous findings, symptoms, and recall timeline for each patient on your list.

For each patient on the list, generate a high-yield, extremely concise, actionable briefing block designed to be read in 10-15 seconds right before starting their procedure.

For each patient, compile:
1. **Header Block**: Patient Name, DOB/Age, Referring Doctor.
2. **Procedure Indication**: Why are they having the scope? (e.g. Asymptomatic bowel cancer screening, iron deficiency anaemia, surveillance of Barrett's, chronic diarrhoea).
3. **Key Clinical Context & Risk Factors**: Previous large polyps, family history of colorectal cancer (CRC), established IBD, suspected celiac, severe GOR D.
4. **Biopsy & Procedural Actions**: Specific procedural actions to take (e.g., "Targeted biopsies of gastroesophageal junction", "Standard gastroscopy to rule out celiac (4 biopsies of D2)", "Strict surveillance of previous EMR site at the cecum", "Take biopsies of terminal ileum and colon to rule out microscopic colitis").

Format the output as a beautiful, highly structured, and clean Markdown briefing document. Include:
- A top summary list of all patients on the list for quick scanning.
- Page breaks or clean sections for each patient.
- Ensure it looks stunning on screen and prints perfectly on A4 paper (with clean headers, high contrast, and spacing).
`;

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

        const body = {
            contents: [{
                parts: [{ text: systemPrompt + "\n\nPATIENT LIST DETAILS:\n" + consolidatedHistoryText }]
            }],
            generationConfig: {
                maxOutputTokens: 8192
            }
        };

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Gemini API Briefing Error: ${res.status} ${errText}`);
        }

        const data = await res.json();
        const briefingMarkdown = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

        return NextResponse.json({
            briefing: briefingMarkdown
        });

    } catch (error: any) {
        console.error('[Endoscopy-Briefing] Route error:', error);
        return NextResponse.json(
            { error: error.message || 'Internal Server Error' },
            { status: 500 }
        );
    }
}
