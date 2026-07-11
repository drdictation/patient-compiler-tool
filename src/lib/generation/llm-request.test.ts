import Module from 'module';

// Define dummy Supabase env variables to prevent supabase.ts throwing errors during require
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-role-key';

type LoadFunction = (request: string, parent: unknown, isMain: boolean) => unknown;
const moduleWithLoad = Module as unknown as { _load: LoadFunction };
const originalLoad = moduleWithLoad._load;

moduleWithLoad._load = function (request: string, parent: unknown, isMain: boolean) {
    if (request === 'server-only') {
        return {};
    }
    if (request === 'next/cache') {
        return {
            revalidatePath: () => {}
        };
    }
    return originalLoad.call(this, request, parent, isMain);
};

import { test } from 'node:test';
import * as assert from 'node:assert';
import {
    classifyError,
    classifyHttpStatus,
    fetchWithRetryAndTimeout,
    BoundedRequestException
} from '../llm-request';

test('Error Classification Rules', async (t) => {
    await t.test('classifies HTTP statuses correctly', () => {
        const err400 = classifyHttpStatus(400);
        assert.strictEqual(err400.category, 'NON_RETRYABLE');
        assert.strictEqual(err400.errorCode, 'BAD_REQUEST');

        const err401 = classifyHttpStatus(401);
        assert.strictEqual(err401.category, 'NON_RETRYABLE');
        assert.strictEqual(err401.errorCode, 'UNAUTHORIZED');

        const err429 = classifyHttpStatus(429, 'Rate limit', 3);
        assert.strictEqual(err429.category, 'RETRYABLE');
        assert.strictEqual(err429.errorCode, 'RATE_LIMIT');
        assert.strictEqual(err429.retryAfterSeconds, 3);

        const err503 = classifyHttpStatus(503);
        assert.strictEqual(err503.category, 'RETRYABLE');
        assert.strictEqual(err503.errorCode, 'SERVER_ERROR');
    });

    await t.test('classifies standard exceptions correctly', () => {
        const abortErr = new Error('The operation was aborted');
        const classAbort = classifyError(abortErr);
        assert.strictEqual(classAbort.category, 'RETRYABLE');
        assert.strictEqual(classAbort.errorCode, 'TIMEOUT');

        const econnErr = new Error('fetch failed: ECONNRESET');
        const classEconn = classifyError(econnErr);
        assert.strictEqual(classEconn.category, 'RETRYABLE');
        assert.strictEqual(classEconn.errorCode, 'NETWORK_ERROR');

        const genericErr = new Error('Some standard error');
        const classGeneric = classifyError(genericErr);
        assert.strictEqual(classGeneric.category, 'NON_RETRYABLE');
        assert.strictEqual(classGeneric.errorCode, 'UNKNOWN_ERROR');
    });
});

test('Timeout and Retry Fetch Logic', async (t) => {
    await t.test('attempts non-retryable error exactly once', async () => {
        let attempts = 0;
        const originalFetch = globalThis.fetch;

        globalThis.fetch = async () => {
            attempts++;
            return {
                ok: false,
                status: 400,
                text: async () => 'Bad Request'
            } as unknown as Response;
        };

        try {
            await fetchWithRetryAndTimeout({
                operation: 'TASK_EXTRACTION',
                url: 'https://dummy.co',
                init: { method: 'POST' }
            });
            assert.fail('Expected request to throw');
        } catch (err: unknown) {
            const casted = err as BoundedRequestException;
            assert.strictEqual(casted.category, 'NON_RETRYABLE');
            assert.strictEqual(casted.httpStatus, 400);
            assert.strictEqual(attempts, 1);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    await t.test('retries retryable error (like 503) at most once (2 attempts total)', async () => {
        let attempts = 0;
        const originalFetch = globalThis.fetch;

        globalThis.fetch = async () => {
            attempts++;
            return {
                ok: false,
                status: 503,
                headers: {
                    get: () => null
                },
                text: async () => 'Service Unavailable'
            } as unknown as Response;
        };

        try {
            await fetchWithRetryAndTimeout({
                operation: 'TASK_EXTRACTION',
                url: 'https://dummy.co',
                init: { method: 'POST' }
            });
            assert.fail('Expected request to throw');
        } catch (err: unknown) {
            const casted = err as BoundedRequestException;
            assert.strictEqual(casted.category, 'RETRYABLE');
            assert.strictEqual(casted.httpStatus, 503);
            assert.strictEqual(attempts, 2);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    await t.test('fails fast if Retry-After is too long (exceeds budget limit)', async () => {
        let attempts = 0;
        const originalFetch = globalThis.fetch;

        globalThis.fetch = async () => {
            attempts++;
            return {
                ok: false,
                status: 429,
                headers: {
                    get: (name: string) => name.toLowerCase() === 'retry-after' ? '10' : null
                },
                text: async () => 'Too Many Requests'
            } as unknown as Response;
        };

        try {
            await fetchWithRetryAndTimeout({
                operation: 'TASK_EXTRACTION',
                url: 'https://dummy.co',
                init: { method: 'POST' }
            });
            assert.fail('Expected request to throw');
        } catch (err: unknown) {
            const casted = err as BoundedRequestException;
            assert.strictEqual(casted.category, 'NON_RETRYABLE');
            assert.strictEqual(casted.errorCode, 'TIMEOUT');
            assert.strictEqual(attempts, 1); // No retry attempted
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    await t.test('NON_RETRYABLE 400 error does not trigger fallbacks in extractTasks', async () => {
        const { extractTasks } = await import('../llm');
        const originalFetch = globalThis.fetch;
        let callCount = 0;
        const fetchedUrls: string[] = [];

        globalThis.fetch = (async (input: RequestInfo | URL) => {
            const urlStr = input.toString();
            if (!urlStr.includes('api.groq.com') && !urlStr.includes('generativelanguage')) {
                return {
                    ok: true,
                    json: async () => ({})
                } as unknown as Response;
            }
            callCount++;
            fetchedUrls.push(urlStr);
            return {
                ok: false,
                status: 400,
                text: async () => 'Bad Request'
            } as unknown as Response;
        }) as typeof fetch;

        try {
            await extractTasks(
                'a '.repeat(50),
                'Test Patient',
                'groq-llama-4',
                'pat-123'
            );
            assert.fail('Expected extractTasks to throw');
        } catch (err: unknown) {
            const casted = err as BoundedRequestException;
            assert.strictEqual(casted.httpStatus, 400);
            assert.strictEqual(callCount, 1);
            assert.ok(fetchedUrls[0].includes('api.groq.com'));
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    await t.test('prevents retry when elapsed time nearly exhausts or exceeds the budget', async () => {
        const originalFetch = globalThis.fetch;
        const originalNow = Date.now;

        let callCount = 0;
        let currentTime = 1000000;
        Date.now = () => currentTime;

        globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
            const urlStr = input.toString();
            if (!urlStr.includes('dummy.co')) {
                return {
                    ok: true,
                    json: async () => ({})
                } as unknown as Response;
            }
            callCount++;
            console.log(`[TEST DEBUG] fetch callCount: ${callCount}, URL: ${urlStr}`);
            if (callCount === 1) {
                // Simulate first attempt took 14.5 seconds of the 15 seconds budget
                currentTime += 14500;
                return {
                    ok: false,
                    status: 503,
                    headers: { get: () => null },
                    text: async () => 'Service Unavailable'
                } as unknown as Response;
            } else {
                // Second attempt takes 1000ms. Since remaining budget is 500ms,
                // the abort controller should fire and cancel the request.
                return new Promise((resolve, reject) => {
                    const timer = setTimeout(() => {
                        resolve({
                            ok: true,
                            json: async () => ({})
                        } as unknown as Response);
                    }, 1000);

                    if (init?.signal) {
                        init.signal.addEventListener('abort', () => {
                            clearTimeout(timer);
                            reject(new DOMException('The user aborted a request.', 'AbortError'));
                        });
                    }
                });
            }
        }) as typeof fetch;

        try {
            await fetchWithRetryAndTimeout({
                operation: 'TASK_EXTRACTION', // Timeout budget is 15000ms
                url: 'https://dummy.co',
                init: { method: 'POST' }
            });
            assert.fail('Expected timeout error');
        } catch (err: unknown) {
            const casted = err as BoundedRequestException;
            assert.strictEqual(casted.errorCode, 'TIMEOUT');
            console.log(`[TEST DEBUG] Final callCount: ${callCount}`);
            assert.strictEqual(callCount, 2); // Attempted second time but timed out
        } finally {
            globalThis.fetch = originalFetch;
            Date.now = originalNow;
        }
    });
});
