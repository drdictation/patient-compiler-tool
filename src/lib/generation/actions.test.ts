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
import { SmartNoteOptions } from '../../app/actions';

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

test('Option and Transcript Validation in prepareSmartNoteGeneration', async (t) => {
    await ensureSupabaseMock();
    const { prepareSmartNoteGeneration } = await import('../../app/actions');

    await t.test('rejects invalid noteType', async () => {
        const options: SmartNoteOptions = {
            patientId: 'pat-123',
            date: '2026-07-12',
            transcript: 'a '.repeat(50),
            patientName: 'John Doe',
            noteType: 'invalid_note_type' as 'new_consult',
            outputs: { generateNote: true, generateLetter: true },
            model: 'gemini-2.5-flash'
        };

        await assert.rejects(
            prepareSmartNoteGeneration(options),
            (err: unknown) => {
                const error = err as { name: string; code: string; message: string };
                assert.strictEqual(error.name, 'GenerationException');
                assert.strictEqual(error.code, 'INVALID_INPUT');
                assert.ok(error.message.includes('noteType'));
                return true;
            }
        );
    });

    await t.test('rejects invalid model', async () => {
        const options: SmartNoteOptions = {
            patientId: 'pat-123',
            date: '2026-07-12',
            transcript: 'a '.repeat(50),
            patientName: 'John Doe',
            noteType: 'new_consult',
            outputs: { generateNote: true, generateLetter: true },
            model: 'invalid-model' as 'gemini-2.5-flash'
        };

        await assert.rejects(
            prepareSmartNoteGeneration(options),
            (err: unknown) => {
                const error = err as { name: string; code: string; message: string };
                assert.strictEqual(error.name, 'GenerationException');
                assert.strictEqual(error.code, 'INVALID_INPUT');
                assert.ok(error.message.includes('model'));
                return true;
            }
        );
    });

    await t.test('rejects invalid letterType', async () => {
        const options: SmartNoteOptions = {
            patientId: 'pat-123',
            date: '2026-07-12',
            transcript: 'a '.repeat(50),
            patientName: 'John Doe',
            noteType: 'new_consult',
            outputs: { generateNote: true, generateLetter: true, letterType: 'invalid_type' as 'review' },
            model: 'gemini-2.5-flash'
        };

        await assert.rejects(
            prepareSmartNoteGeneration(options),
            (err: unknown) => {
                const error = err as { name: string; code: string; message: string };
                assert.strictEqual(error.name, 'GenerationException');
                assert.strictEqual(error.code, 'INVALID_INPUT');
                assert.ok(error.message.includes('letterType'));
                return true;
            }
        );
    });
});

test('Database Flow and Context Generation', async (t) => {
    await ensureSupabaseMock();
    const { prepareSmartNoteGeneration } = await import('../../app/actions');

    t.afterEach(() => {
        supabaseClient.from = originalFrom;
    });

    await t.test('creates PreparedSmartNoteContext on success', async () => {
        const callCount = {
            canonical_patient: 0,
            encounter_select: 0,
            encounter_insert: 0,
            artifact_select: 0,
            artifact_insert: 0,
            artifact_version_insert: 0
        };

        supabaseClient.from = (table: string): unknown => {
            return {
                select: () => {
                    return {
                        eq: () => {
                            return {
                                eq: () => {
                                    return {
                                        single: async () => {
                                            if (table === 'encounter') {
                                                callCount.encounter_select++;
                                                return { data: { id: 'enc-456' }, error: null };
                                            }
                                            if (table === 'artifact') {
                                                callCount.artifact_select++;
                                                return { data: { id: 'art-789', current_version: 1 }, error: null };
                                            }
                                            return { data: null, error: null };
                                        }
                                    };
                                },
                                maybeSingle: async () => {
                                    if (table === 'canonical_patient') {
                                        callCount.canonical_patient++;
                                        return { data: { id: 'pat-123', display_name: 'Authoritative Patient Name' }, error: null };
                                    }
                                    return { data: null, error: null };
                                },
                                single: async () => {
                                    if (table === 'encounter') {
                                        callCount.encounter_select++;
                                        return { data: { id: 'enc-456' }, error: null };
                                    }
                                    if (table === 'artifact') {
                                        callCount.artifact_select++;
                                        return { data: { id: 'art-789', current_version: 1 }, error: null };
                                    }
                                    return { data: null, error: null };
                                }
                            };
                        }
                    };
                },
                insert: () => {
                    return {
                        select: () => {
                            return {
                                single: async () => {
                                    if (table === 'encounter') {
                                        callCount.encounter_insert++;
                                        return { data: { id: 'enc-created' }, error: null };
                                    }
                                    if (table === 'artifact') {
                                        callCount.artifact_insert++;
                                        return { data: { id: 'art-created' }, error: null };
                                    }
                                    return { data: null, error: null };
                                }
                            };
                        },
                        then: async (resolve: (val: unknown) => void) => {
                            if (table === 'artifact_version') {
                                callCount.artifact_version_insert++;
                                return resolve({ data: {}, error: null });
                            }
                        }
                    };
                },
                update: () => {
                    return {
                        eq: () => {
                            return {
                                then: async (resolve: (val: unknown) => void) => {
                                    return resolve({ data: {}, error: null });
                                }
                            };
                        }
                    };
                }
            };
        };

        const options: SmartNoteOptions = {
            patientId: 'pat-123',
            date: '2026-07-12',
            transcript: 'a '.repeat(50),
            patientName: 'Trusted Client Name',
            noteType: 'new_consult',
            outputs: { generateNote: true, generateLetter: true },
            model: 'gemini-2.5-flash'
        };

        const context = await prepareSmartNoteGeneration(options);
        
        assert.ok(context.requestId);
        assert.strictEqual(context.patientId, 'pat-123');
        assert.strictEqual(context.patientName, 'Authoritative Patient Name');
        assert.strictEqual(context.encounterId, 'enc-456');
        assert.strictEqual(context.encounterDate, '2026-07-12');
        assert.strictEqual(context.formattedDate, '12 July 2026');
        assert.ok(context.normalisedTranscript);
        assert.ok(context.transcriptHash);
        assert.strictEqual(context.transcriptArtifactId, 'art-789');
        assert.strictEqual(context.outputs.generateNote, true);
        assert.strictEqual(context.outputs.generateLetter, true);
        assert.strictEqual(context.model, 'gemini-2.5-flash');
        assert.strictEqual(context.extractTasks, false);

        assert.strictEqual((context as unknown as { transcript?: string }).transcript, undefined);

        assert.strictEqual(callCount.canonical_patient, 1);
        assert.strictEqual(callCount.encounter_select, 1);
        assert.strictEqual(callCount.artifact_select, 1);
    });

    await t.test('fails when raw transcript persistence fails', async () => {
        supabaseClient.from = (table: string): unknown => {
            return {
                select: () => {
                    return {
                        eq: () => {
                            return {
                                single: async () => {
                                    if (table === 'encounter') {
                                        return { data: { id: 'enc-456' }, error: null };
                                    }
                                    if (table === 'artifact') {
                                        return { data: null, error: { message: 'Database disconnected' } };
                                    }
                                    return { data: null, error: null };
                                },
                                maybeSingle: async () => {
                                    if (table === 'canonical_patient') {
                                        return { data: { id: 'pat-123', display_name: 'Authoritative Patient Name' }, error: null };
                                    }
                                    return { data: null, error: null };
                                }
                            };
                        }
                    };
                },
                insert: () => {
                    return {
                        select: () => {
                            return {
                                single: async () => {
                                    return { data: null, error: { message: 'Database disconnected' } };
                                }
                            };
                        }
                    };
                }
            };
        };

        const options: SmartNoteOptions = {
            patientId: 'pat-123',
            date: '2026-07-12',
            transcript: 'a '.repeat(50),
            patientName: 'John Doe',
            noteType: 'new_consult',
            outputs: { generateNote: true, generateLetter: true },
            model: 'gemini-2.5-flash'
        };

        await assert.rejects(
            prepareSmartNoteGeneration(options),
            (err: unknown) => {
                const error = err as { name: string; code: string };
                assert.strictEqual(error.name, 'GenerationException');
                assert.strictEqual(error.code, 'PERSISTENCE_FAILED');
                return true;
            }
        );
    });
});
