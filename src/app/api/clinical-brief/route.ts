import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';

export const maxDuration = 60;

export async function POST(request: Request) {
    try {
        if (!(await isAuthenticated())) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
        }

        const { text } = await request.json();
        if (!text || !text.trim()) {
            return NextResponse.json({ error: 'Missing clinical text to summarize' }, { status: 400 });
        }

        const systemPrompt = `
You are an expert gastroenterologist assistant.
Your task is to analyze the following raw clinical text extracted via OCR from a patient's medical records or referral letters.
Generate an extremely concise 1-sentence clinical briefing of the patient, outlining their age, gender, main symptoms or indication, previous findings/history, and primary procedural need if applicable.

Example output:
- "50 yo asymptomatic female with family history of colorectal cancer, scheduled for screening colonoscopy."
- "64 yo male presenting with iron deficiency anaemia, scheduled for gastroscopy and colonoscopy to investigate."
- "35 yo female with chronic bloating, severe constipation, and suspected IBS-C."

Keep the tone highly professional, precise, and clinical. Avoid fluff or introductory phrases. Return ONLY the 1-sentence brief.
`;

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

        const body = {
            contents: [{
                parts: [{ text: systemPrompt + "\n\nRAW CLINICAL TEXT:\n" + text.trim() }]
            }],
            generationConfig: {
                maxOutputTokens: 256
            }
        };

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Gemini API Error: ${res.status} ${errText}`);
        }

        const data = await res.json();
        const brief = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

        return NextResponse.json({
            brief: brief.trim()
        });

    } catch (error: any) {
        console.error('[Clinical-Brief] API route error:', error);
        return NextResponse.json(
            { error: error.message || 'Internal Server Error' },
            { status: 500 }
        );
    }
}
