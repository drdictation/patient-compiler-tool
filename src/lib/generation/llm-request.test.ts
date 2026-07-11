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
});
