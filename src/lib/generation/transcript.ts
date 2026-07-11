import * as crypto from 'crypto';

// Verified model context limit for Gemini 2.5/3.0 Flash: 1,048,576 tokens (approx. 4,000,000 characters).
// We set a conservative operational limit of 250,000 characters to prevent timeouts/OOM.
export const MAX_TRANSCRIPT_CHARS = 250000;
export const MIN_TRANSCRIPT_CHARS = 50;

/**
 * Pure function to normalise a clinical transcript according to Phase 1 rules.
 */
export function normaliseTranscript(text: string): string {
    if (!text) return '';
    
    return text
        .normalize('NFC')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split('\n')
        .map(line => line.trimEnd())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n');
}

/**
 * Validates the normalised transcript.
 * Returns null if valid, or a tuple [errorCode, errorMessage] if invalid.
 */
export function validateTranscript(text: string): [ 'INVALID_INPUT' | 'TRANSCRIPT_TOO_SHORT' | 'TRANSCRIPT_TOO_LARGE', string ] | null {
    const trimmed = text.trim();
    if (!trimmed) {
        return ['INVALID_INPUT', 'Transcript cannot be empty or whitespace-only.'];
    }

    const nonWhitespaceCount = trimmed.replace(/\s/g, '').length;
    if (nonWhitespaceCount < MIN_TRANSCRIPT_CHARS) {
        return [
            'TRANSCRIPT_TOO_SHORT',
            `Transcript is too short. It must contain at least ${MIN_TRANSCRIPT_CHARS} non-whitespace characters (currently: ${nonWhitespaceCount}).`
        ];
    }

    if (text.length > MAX_TRANSCRIPT_CHARS) {
        return [
            'TRANSCRIPT_TOO_LARGE',
            `Transcript is too large. Max character limit is ${MAX_TRANSCRIPT_CHARS} (currently: ${text.length}).`
        ];
    }

    return null;
}

/**
 * Server-only cryptographic hash helper.
 * Never logs the transcript itself.
 */
export function hashTranscript(normalisedText: string): string {
    return crypto.createHash('sha256').update(normalisedText).digest('hex');
}
