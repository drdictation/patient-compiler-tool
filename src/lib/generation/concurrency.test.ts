import Module from 'module';

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
import { PreparedSmartNoteContext } from './contracts';

let supabaseClient: { from: unknown };
let originalFrom: unknown;

async function ensureSupabaseMock() {
    if (!supabaseClient) {
        process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co';
        process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-role-key';
        const mod = await import('../supabase');
        supabaseClient = mod.supabase as unknown as { from: unknown };
        originalFrom = supabaseClient.from;
    }
}

test('Parallel Clinical Document Generation', async (t) => {
    await ensureSupabaseMock();
    const { generateClinicalDocuments } = await import('../../app/actions');

    t.afterEach(() => {
        supabaseClient.from = originalFrom;
    });

    await t.test('calls both note and letter concurrently', async () => {
        const callCount = {
            artifact_select: 0,
            artifact_insert: 0,
            artifact_version_insert: 0
        };

        supabaseClient.from = (table: string): unknown => {
            const chainable = {
                select: () => chainable,
                eq: () => chainable,
                single: async () => {
                    if (table === 'artifact') {
                        callCount.artifact_select++;
                        return { data: { id: 'art-id', current_version: 1 }, error: null };
                    }
                    return { data: null, error: null };
                },
                insert: () => chainable,
                update: () => chainable,
                then: async (resolve: (val: unknown) => void) => {
                    if (table === 'artifact_version') {
                        callCount.artifact_version_insert++;
                        return resolve({ data: {}, error: null });
                    }
                    return resolve({ data: {}, error: null });
                }
            };
            return chainable;
        };

        const context: PreparedSmartNoteContext = {
            requestId: 'req-123',
            patientId: 'pat-123',
            patientName: 'Authoritative Patient Name',
            encounterId: 'enc-456',
            encounterDate: '2026-07-12',
            formattedDate: '12 July 2026',
            normalisedTranscript: 'a '.repeat(50),
            transcriptHash: 'hash-123',
            transcriptArtifactId: 'art-transcript',
            noteType: 'new_consult',
            outputs: {
                generateNote: true,
                generateLetter: true,
                letterType: 'review',
                templateType: 'general'
            },
            model: 'gemini-2.5-flash',
            extractTasks: true,
            promptVersion: '1.0'
        };

        const originalFetch = globalThis.fetch;
        globalThis.fetch = (async (input: RequestInfo | URL) => {
            await new Promise(r => setTimeout(r, 50));
            return {
                ok: true,
                json: async () => ({
                    candidates: [
                        {
                            content: {
                                parts: [
                                    {
                                        text: `
# Summary
The patient had a follow-up consultation today. They are feeling well.

# Impression and Plan
We will continue monitoring the current plan.
Kind regards,
Dr. Smith
                                        `.trim()
                                    }
                                ]
                            }
                        }
                    ],
                    usageMetadata: {
                        promptTokenCount: 10,
                        candidatesTokenCount: 20
                    }
                })
            } as unknown as Response;
        }) as typeof fetch;

        try {
            const start = Date.now();
            const result = await generateClinicalDocuments(context);
            const elapsed = Date.now() - start;

            assert.ok(elapsed < 90, `Execution took ${elapsed}ms, which suggests sequential execution instead of parallel`);
            
            assert.strictEqual(result.note?.status, 'success');
            assert.strictEqual(result.letter?.status, 'success');
            assert.strictEqual(result.note?.artifactId, 'art-id');
            assert.strictEqual(result.letter?.artifactId, 'art-id');
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});

test('Batch Task Persistence', async (t) => {
    await ensureSupabaseMock();
    const { extractAndSaveTasks } = await import('../../app/actions');

    t.afterEach(() => {
        supabaseClient.from = originalFrom;
    });

    await t.test('batch inserts all extracted tasks in a single query', async () => {
        let insertedRows: unknown[] = [];
        let insertCallCount = 0;

        supabaseClient.from = (table: string): unknown => {
            return {
                insert: (rows: unknown[]) => {
                    if (table === 'patient_task') {
                        insertCallCount++;
                        insertedRows = rows;
                        return { error: null };
                    }
                    return { error: null };
                }
            };
        };

        const originalFetch = globalThis.fetch;
        globalThis.fetch = async () => {
            return {
                ok: true,
                json: async () => ({
                    choices: [
                        {
                            message: {
                                content: JSON.stringify([
                                    { task_description: 'Task 1', task_category: 'clinical', evidence_quote: 'quote 1', confidence: 'high' },
                                    { task_description: 'Task 2', task_category: 'administrative', evidence_quote: 'quote 2', confidence: 'medium' }
                                ])
                            }
                        }
                    ],
                    usage: {
                        prompt_tokens: 100,
                        completion_tokens: 200
                    }
                })
            } as unknown as Response;
        };

        const context: PreparedSmartNoteContext = {
            requestId: 'req-123',
            patientId: 'pat-123',
            patientName: 'Authoritative Patient Name',
            encounterId: 'enc-456',
            encounterDate: '2026-07-12',
            formattedDate: '12 July 2026',
            normalisedTranscript: 'a '.repeat(50),
            transcriptHash: 'hash-123',
            transcriptArtifactId: 'art-transcript',
            noteType: 'new_consult',
            outputs: {
                generateNote: true,
                generateLetter: true
            },
            model: 'gemini-2.5-flash',
            extractTasks: true,
            promptVersion: '1.0'
        };

        try {
            const result = await extractAndSaveTasks(context);
            
            assert.strictEqual(result.status, 'success');
            assert.strictEqual(result.insertedCount, 2);
            assert.strictEqual(insertCallCount, 1);
            assert.strictEqual(insertedRows.length, 2);
            assert.strictEqual((insertedRows[0] as { task_description: string }).task_description, 'Task 1');
            assert.strictEqual((insertedRows[1] as { task_description: string }).task_description, 'Task 2');
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});
