import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { cleanPatientDisplayName } from '@/app/actions';

export const maxDuration = 60;

const ENDOSCOPY_PROMPT = `
You are an expert Australian gastroenterology clinical specialist and medical records analyst.
Your task is to analyze the provided image of a medical referral letter for an endoscopy list (e.g. GP referral or outpatient scope request).

Extract all clinically relevant details and return strictly valid JSON matching this schema:

{
  "patient": {
    "displayName": "string (Full patient name WITHOUT ANY salutations or titles such as Mr, Mrs, Ms, Miss, Dr, Prof. E.g. 'Vanessa Lynn', NOT 'Ms. Vanessa Lynn')",
    "dateOfBirth": "string (DD/MM/YYYY or YYYY-MM-DD format if found, e.g. '14/08/1972', or empty string if not found)",
    "gender": "string (e.g. 'Female', 'Male', or empty string)",
    "referringDoctor": "string (Referring GP/Doctor name with title, e.g. 'Dr. Sarah Jenkins', or 'Unknown')",
    "referralDate": "string (Date of the letter e.g. '10/09/2026', or empty string)"
  },
  "procedure": "string (The requested endoscopy procedure, e.g. 'Gastroscopy + Colonoscopy', 'Colonoscopy', 'Gastroscopy', 'Flexible Sigmoidoscopy', or 'Endoscopy')",
  "summaryCard": {
    "indication": "string (Concise bullet points: main indication, symptoms, duration, abnormal investigations e.g. Ferritin 7, Hb 102, FOBT positive, altered bowel habit)",
    "risksAndContext": "string (Concise bullet points: anticoagulant/antiplatelet status and cessation instructions, allergies, major comorbidities/sedation risks, family history of colorectal cancer, previous colonoscopy/gastroscopy findings & dates)",
    "proceduralActions": "string (Actionable procedural instructions tailored to indications: e.g., 'Targeted D2 duodenal biopsies to rule out celiac disease', 'Antral and body biopsies for H. pylori', 'Colonoscopy to cecum; random colonic biopsies for microscopic colitis', 'Careful surveillance of prior polypectomy/EMR site')"
  },
  "rawOcrText": "string (Complete, verbatim textual transcription of all readable text in the referral letter, preserving medical history, medications, allergies, and investigations for medico-legal auditability)"
}

Guidelines:
- Ground all facts strictly in what is visible in the letter. Do not invent diagnoses, medications, or lab values.
- In proceduralActions, provide practical gastroenterology procedural guidance matching the indication.
- NEVER include titles (Mr, Ms, Mrs, Dr) in patient.displayName.
- Maintain professional Australian medical conventions.
- Return ONLY valid JSON.
`;

const GENERAL_CONSULT_PROMPT = `
You are an expert Australian gastroenterology clinical specialist and medical records analyst.
Your task is to analyze the provided image of a medical referral letter for a general clinical consultation review.

Extract all clinically relevant details and return strictly valid JSON matching this schema:

{
  "patient": {
    "displayName": "string (Full patient name WITHOUT ANY salutations or titles such as Mr, Mrs, Ms, Miss, Dr, Prof. E.g. 'Vanessa Lynn', NOT 'Ms. Vanessa Lynn')",
    "dateOfBirth": "string (DD/MM/YYYY or YYYY-MM-DD format if found, e.g. '14/08/1972', or empty string if not found)",
    "gender": "string (e.g. 'Female', 'Male', or empty string)",
    "referringDoctor": "string (Referring GP/Doctor name with title, e.g. 'Dr. Sarah Jenkins', or 'Unknown')",
    "referralDate": "string (Date of the letter e.g. '10/09/2026', or empty string)"
  },
  "clinicalFocus": "string (Primary reason for consult or clinical question, e.g. 'Altered bowel habits & iron deficiency', 'Suspected IBD', 'Reflux & dysphagia')",
  "summaryCard": {
    "reasonForReferral": "string (Concise bullet points: main presenting complaint, symptoms, timeline/duration, severity, and reason the GP is referring)",
    "medicalHistoryAndMeds": "string (Concise bullet points: past medical and surgical history, current regular medications, known allergies / adverse reactions)",
    "investigations": "string (Concise bullet points: prior pathology results e.g. FBE, iron studies, LFTs, calprotectin, imaging/scans, or prior scope reports mentioned)",
    "questionsAndPlan": "string (Concise bullet points: specific questions GP wants answered, key differential diagnoses to evaluate, and suggested pre-consult focus)"
  },
  "rawOcrText": "string (Complete, verbatim textual transcription of all readable text in the referral letter, preserving medical history, medications, allergies, and investigations for medico-legal auditability)"
}

Guidelines:
- Ground all facts strictly in what is visible in the letter. Do not invent diagnoses, medications, or lab values.
- NEVER include titles (Mr, Ms, Mrs, Dr) in patient.displayName.
- Maintain professional Australian medical conventions.
- Return ONLY valid JSON.
`;

export async function POST(request: Request) {
    try {
        if (!(await isAuthenticated())) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: 'GEMINI_API_KEY is not configured' }, { status: 500 });
        }

        let base64Data = '';
        let mimeType = 'image/jpeg';
        let mode: 'endoscopy' | 'general' = 'endoscopy';

        const contentType = request.headers.get('content-type') || '';

        if (contentType.includes('multipart/form-data')) {
            const formData = await request.formData();
            const file = formData.get('image') as File | null;
            if (!file) {
                return NextResponse.json({ error: 'No image file provided' }, { status: 400 });
            }
            const modeParam = formData.get('mode') as string | null;
            if (modeParam === 'general' || modeParam === 'endoscopy') {
                mode = modeParam;
            }
            const buffer = Buffer.from(await file.arrayBuffer());
            base64Data = buffer.toString('base64');
            mimeType = file.type || 'image/jpeg';
        } else {
            const body = await request.json();
            if (!body.imageBase64) {
                return NextResponse.json({ error: 'Missing imageBase64 payload' }, { status: 400 });
            }
            if (body.mode === 'general' || body.mode === 'endoscopy') {
                mode = body.mode;
            }
            let rawStr = body.imageBase64;
            if (rawStr.startsWith('data:')) {
                const match = rawStr.match(/^data:([^;]+);base64,(.+)$/);
                if (match) {
                    mimeType = match[1];
                    base64Data = match[2];
                } else {
                    base64Data = rawStr.split(',')[1] || rawStr;
                }
            } else {
                base64Data = rawStr;
            }
            if (body.mimeType) {
                mimeType = body.mimeType;
            }
        }

        if (!base64Data || base64Data.trim().length === 0) {
            return NextResponse.json({ error: 'Empty image data' }, { status: 400 });
        }

        const systemPrompt = mode === 'general' ? GENERAL_CONSULT_PROMPT : ENDOSCOPY_PROMPT;

        // Ephemeral in-memory call to Gemini 2.5 Flash
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

        const payload = {
            contents: [
                {
                    parts: [
                        { text: systemPrompt },
                        {
                            inlineData: {
                                mimeType: mimeType,
                                data: base64Data
                            }
                        }
                    ]
                }
            ],
            generationConfig: {
                responseMimeType: 'application/json',
                temperature: 0.1,
                maxOutputTokens: 4096
            }
        };

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errBody = await res.text();
            throw new Error(`Gemini Vision API Error: ${res.status} ${errBody}`);
        }

        const data = await res.json();
        const rawJsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!rawJsonText) {
            throw new Error('Gemini returned an empty response for the referral image.');
        }

        let parsed;
        try {
            parsed = JSON.parse(rawJsonText);
        } catch (e) {
            console.error('Failed to parse Gemini JSON output:', rawJsonText);
            throw new Error('Failed to parse structured clinical data from referral image.');
        }

        // Sanitize patient name on backend
        if (parsed.patient && parsed.patient.displayName) {
            parsed.patient.displayName = cleanPatientDisplayName(parsed.patient.displayName);
        }

        return NextResponse.json({
            success: true,
            mode,
            data: parsed
        });

    } catch (error: any) {
        console.error('[Referral-Intake] Error:', error);
        return NextResponse.json(
            { error: error.message || 'Internal Server Error' },
            { status: 500 }
        );
    }
}
