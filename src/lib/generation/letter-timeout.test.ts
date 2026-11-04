import Module from 'module';
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { TIMEOUTS } from '../llm-request';

const moduleWithLoad = Module as unknown as { _load: (request: string, parent: unknown, isMain: boolean) => unknown };
const originalLoad = moduleWithLoad._load;
moduleWithLoad._load = function (request, parent, isMain) {
    if (request === 'server-only') return {};
    return originalLoad.call(this, request, parent, isMain);
};
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://dummy.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'dummy-key';
process.env.OPENAI_API_KEY = 'mock-key';
process.env.GEMINI_API_KEY = 'mock-key';

test('letter generation falls back from GPT to Gemini with a longer timeout for both', async () => {
    const originalFetch = globalThis.fetch;
    const originalSetTimeout = globalThis.setTimeout;
    const urls: string[] = [];
    const delays: number[] = [];
    globalThis.setTimeout = ((callback: (...args: unknown[]) => void, delay?: number, ...args: unknown[]) => {
        if (delay !== undefined) delays.push(delay);
        return originalSetTimeout(callback, delay, ...args);
    }) as typeof setTimeout;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = input.toString();
        urls.push(url);
        if (url.includes('api.openai.com')) return new Response('Bad request', { status: 400 });
        if (url.includes('generativelanguage.googleapis.com')) {
            return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Fallback letter' }] }, finishReason: 'STOP' }] }), { status: 200 });
        }
        return new Response('{}', { status: 201 });
    }) as typeof fetch;
    try {
        const { generateFromPrompt } = await import('../llm');
        const result = await generateFromPrompt({
            systemInstructions: 'Write a letter.',
            transcript: 'Consultation transcript.',
            metadata: { patientName: 'Jane Doe', documentType: 'referrer_letter', templateType: 'general' },
            model: 'gpt-6-luna', purpose: 'test'
        });
        assert.equal(result.content, 'Fallback letter');
        assert.equal(result.model, 'gemini-3.8-flash');
        assert.equal(urls.filter(url => url.includes('api.openai.com')).length, 1);
        assert.ok(urls.some(url => url.includes('models/gemini-3.8-flash:generateContent')));
        assert.equal(TIMEOUTS.LETTER_GENERATION, 120000);
        assert.equal(delays.filter(delay => delay > 119000 && delay <= 120000).length, 2);
    } finally {
        globalThis.fetch = originalFetch;
        globalThis.setTimeout = originalSetTimeout;
    }
});
