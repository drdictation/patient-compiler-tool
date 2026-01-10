import { NextRequest, NextResponse } from 'next/server';

/**
 * Audio Transcription API Route
 * 
 * Uses Groq Whisper API (whisper-large-v3) to transcribe audio files.
 * This endpoint is used by the Smart Note feature for audio recording mode.
 */

export async function POST(request: NextRequest) {
    try {
        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) {
            return NextResponse.json(
                { error: 'GROQ_API_KEY not configured' },
                { status: 500 }
            );
        }

        // Get the audio file from form data
        const formData = await request.formData();
        const audioFile = formData.get('file') as File | null;

        if (!audioFile) {
            return NextResponse.json(
                { error: 'No audio file provided' },
                { status: 400 }
            );
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
            console.error('Groq Whisper API error:', errorText);
            return NextResponse.json(
                { error: `Transcription failed: ${response.status}` },
                { status: response.status }
            );
        }

        const data = await response.json();

        return NextResponse.json({
            transcript: data.text || '',
            duration: data.duration || null
        });

    } catch (error) {
        console.error('Transcription error:', error);
        return NextResponse.json(
            { error: 'Internal server error during transcription' },
            { status: 500 }
        );
    }
}
