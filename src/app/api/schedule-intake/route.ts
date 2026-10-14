import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';

export const maxDuration = 60;

const SCHEDULE_PARSE_PROMPT = `
You are an expert Australian clinical medical records specialist.
Your task is to analyze the provided image of a clinic or endoscopy day list appointment schedule.

Extract all scheduled patients and return strictly valid JSON matching this schema:
{
  "patients": [
    {
      "rawText": "string (verbatim line text)",
      "surname": "string (e.g. 'WHITE', 'STOKES')",
      "firstName": "string (e.g. 'Christopher', 'Brayden')",
      "fullDisplayName": "string (Formatted as 'Firstname Lastname' in title case, e.g. 'Christopher White', 'Brayden Stokes')",
      "notes": "string or null (e.g. '$245 rv in 3.5 months', 'aged pensioner rate')"
    }
  ]
}

Guidelines:
- Each row represents a patient appointment.
- Rows usually start with SURNAME (in ALL CAPS or title case) followed by First Name.
- Ignore generic clinic header text, doctor names ('CHAMARA', 'EAST MELB'), or appointment type watermarks ('TELEHEALTH VIDEO', 'PHONE').
- In fullDisplayName, format cleanly as "Firstname Lastname" (e.g. 'Holly McCarthy', 'Florence Kant', 'Andrew Goldberg').
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
        let mimeType = 'image/png';

        const contentType = request.headers.get('content-type') || '';
        if (contentType.includes('multipart/form-data')) {
            const formData = await request.formData();
            const file = formData.get('image') as File | null;
            if (!file) {
                return NextResponse.json({ error: 'No image file provided' }, { status: 400 });
            }
            const buffer = Buffer.from(await file.arrayBuffer());
            base64Data = buffer.toString('base64');
            mimeType = file.type || 'image/png';
        } else {
            const body = await request.json();
            if (!body.imageBase64) {
                return NextResponse.json({ error: 'Missing imageBase64 payload' }, { status: 400 });
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
            if (body.mimeType) mimeType = body.mimeType;
        }

        if (!base64Data || base64Data.trim().length === 0) {
            return NextResponse.json({ error: 'Empty image data' }, { status: 400 });
        }

        // Ephemeral in-memory call to Gemini 2.5 Flash
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

        const payload = {
            contents: [
                {
                    parts: [
                        { text: SCHEDULE_PARSE_PROMPT },
                        {
                            inlineData: {
                                mimeType,
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
            throw new Error('Gemini returned an empty candidate response');
        }

        const parsed = JSON.parse(rawJsonText);
        const patients = Array.isArray(parsed.patients) ? parsed.patients : [];

        return NextResponse.json({ success: true, patients });
    } catch (error: any) {
        console.error('Schedule OCR error:', error);
        return NextResponse.json({ error: error.message || 'Failed to parse schedule' }, { status: 500 });
    }
}
