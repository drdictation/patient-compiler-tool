import { test } from 'node:test';
import * as assert from 'node:assert';
import { normaliseTranscript, validateTranscript, hashTranscript } from './transcript';

test('Transcript Normalisation', async (t) => {
    await t.test('normalises CRLF to LF', () => {
        const input = 'Hello\r\nWorld\rThis\nIs\r\nA Test';
        const expected = 'Hello\nWorld\nThis\nIs\nA Test';
        assert.strictEqual(normaliseTranscript(input), expected);
    });

    await t.test('trims trailing whitespace on each line', () => {
        const input = 'Line 1   \nLine 2 \nLine 3';
        const expected = 'Line 1\nLine 2\nLine 3';
        assert.strictEqual(normaliseTranscript(input), expected);
    });

    await t.test('collapses 3 or more blank lines to 2', () => {
        const input = 'Line 1\n\n\n\nLine 2\n\n\nLine 3';
        const expected = 'Line 1\n\nLine 2\n\nLine 3';
        assert.strictEqual(normaliseTranscript(input), expected);
    });

    await t.test('preserves speaker labels, case, punctuation, and Unicode', () => {
        const input = 'Dr. Smíth (Gastro): How are you?\nPatient: Good, thanks!';
        const normalised = normaliseTranscript(input);
        assert.strictEqual(normalised, 'Dr. Smíth (Gastro): How are you?\nPatient: Good, thanks!');
        // Unicode check (NFC normalization)
        const accentedChar = 'e\u0301'; // é decomposed
        const normalisedAccented = normaliseTranscript(accentedChar);
        assert.strictEqual(normalisedAccented, 'é'); // normalised to NFC
    });
});

test('Transcript Limit Validation', async (t) => {
    await t.test('rejects empty or whitespace-only inputs', () => {
        const emptyResult = validateTranscript('');
        assert.ok(emptyResult);
        assert.strictEqual(emptyResult[0], 'INVALID_INPUT');

        const whitespaceResult = validateTranscript('    \n   ');
        assert.ok(whitespaceResult);
        assert.strictEqual(whitespaceResult[0], 'INVALID_INPUT');
    });

    await t.test('rejects inputs shorter than 50 non-whitespace characters', () => {
        const shortInput = 'a '.repeat(24).trim(); // 24 non-whitespace chars
        const result = validateTranscript(shortInput);
        assert.ok(result);
        assert.strictEqual(result[0], 'TRANSCRIPT_TOO_SHORT');
    });

    await t.test('accepts inputs with 50 or more non-whitespace characters', () => {
        const validInput = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRST1234567890'; // 56 chars
        const result = validateTranscript(validInput);
        assert.strictEqual(result, null);
    });

    await t.test('rejects inputs larger than 250,000 characters', () => {
        const hugeInput = 'a'.repeat(250001);
        const result = validateTranscript(hugeInput);
        assert.ok(result);
        assert.strictEqual(result[0], 'TRANSCRIPT_TOO_LARGE');
    });
});

test('Transcript Hashing', () => {
    const text = 'Some normalised transcript text';
    const hash1 = hashTranscript(text);
    const hash2 = hashTranscript(text);
    
    // Hash should be 64 char hex string (sha256)
    assert.strictEqual(hash1.length, 64);
    assert.strictEqual(hash1, hash2);
    
    const hashDiff = hashTranscript(text + 'a');
    assert.notStrictEqual(hash1, hashDiff);
});
