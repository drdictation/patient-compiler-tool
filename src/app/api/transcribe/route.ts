import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { fetchWithRetryAndTimeout } from '@/lib/llm-request';

export const maxDuration = 60; // 60 seconds maximum (Vercel hobby plan max is 60s, pro is 300s)

export async function POST(request: Request) {
    try {
        if (!(await isAuthenticated())) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) {
            return NextResponse.json(
                { error: 'GROQ_API_KEY not configured on server' },
                { status: 500 }
            );
        }

        const formData = await request.formData();
        const file = formData.get('file');

        if (!file || !(file instanceof Blob)) {
            return NextResponse.json(
                { error: 'No valid audio file provided in request' },
                { status: 400 }
            );
        }

        // Vercel hard limits serverless function payloads to 4.5MB
        const sizeMB = file.size / (1024 * 1024);
        if (sizeMB > 4.5) {
            return NextResponse.json(
                { error: `File too large (${sizeMB.toFixed(1)}MB). Vercel limits uploads to 4.5MB. Try a shorter recording.` },
                { status: 413 }
            );
        }

        const groqFormData = new FormData();
        groqFormData.append('file', file, 'audio.webm');
        groqFormData.append('model', 'whisper-large-v3');

        console.log(`[Transcription] Sending ${sizeMB.toFixed(2)}MB file to Groq...`);

        const response = await fetchWithRetryAndTimeout({
            operation: 'TRANSCRIPTION',
            url: 'https://api.groq.com/openai/v1/audio/transcriptions',
            init: {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`
                },
                body: groqFormData
            },
            provider: 'groq',
            model: 'whisper-large-v3'
        });

        const data = await response.json();

        return NextResponse.json({
            transcript: data.text || '',
            duration: data.duration || null
        });

    } catch (error: any) {
        console.error('[Transcription] API route critical error:', error);
        return NextResponse.json(
            { error: error.message || 'Internal error during transcription request' },
            { status: error.httpStatus || 500 }
        );
    }
}
