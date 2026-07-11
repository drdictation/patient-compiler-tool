import { test } from 'node:test';
import * as assert from 'node:assert';
import { validateGeneratedLetter } from './letter-validation';

test('Letter Validation Fatal Rules', async (t) => {
    const defaultInput = {
        text: `
# Summary
The patient had a follow-up consultation today. They are feeling well.

# Impression and Plan
We will continue monitoring the current plan.
Kind regards,
Dr. Smith
        `.trim(),
        authoritativePatientName: 'Jane Doe',
        transcript: 'Patient follow up today. Feeling well. Keep monitoring.',
        letterType: 'review',
        templateType: 'general',
        metadata: {
            content: '...',
            usage: { input_tokens: 10, output_tokens: 10 },
            finishReason: 'STOP',
            blocked: false,
            model: 'gemini-2.5-flash'
        }
    };

    await t.test('passes a standard valid letter', () => {
        const result = validateGeneratedLetter(defaultInput);
        assert.strictEqual(result.valid, true);
        assert.strictEqual(result.fatalErrors.length, 0);
    });

    await t.test('rejects letters that are too short', () => {
        const result = validateGeneratedLetter({
            ...defaultInput,
            text: 'Summary: Too short.'
        });
        assert.strictEqual(result.valid, false);
        assert.ok(result.fatalErrors.some(err => err.includes('too short')));
    });

    await t.test('rejects blocked or truncated generation', () => {
        const result = validateGeneratedLetter({
            ...defaultInput,
            metadata: {
                ...defaultInput.metadata,
                blocked: true,
                blockReason: 'Safety settings triggered'
            }
        });
        assert.strictEqual(result.valid, false);
        assert.ok(result.fatalErrors.some(err => err.includes('blocked')));

        const result2 = validateGeneratedLetter({
            ...defaultInput,
            metadata: {
                ...defaultInput.metadata,
                finishReason: 'MAX_TOKENS'
            }
        });
        assert.strictEqual(result2.valid, false);
        assert.ok(result2.fatalErrors.some(err => err.includes('finish reason')));
    });

    await t.test('rejects unresolved template brackets', () => {
        const result = validateGeneratedLetter({
            ...defaultInput,
            text: defaultInput.text + '\nWe scheduled it for {{date}}.'
        });
        assert.strictEqual(result.valid, false);
        assert.ok(result.fatalErrors.some(err => err.includes('placeholders matching {{placeholder}}')));
    });

    await t.test('rejects scaffold leakage text', () => {
        const result = validateGeneratedLetter({
            ...defaultInput,
            text: defaultInput.text + '\n[Key diagnosis here]'
        });
        assert.strictEqual(result.valid, false);
        assert.ok(result.fatalErrors.some(err => err.includes('Scaffold placeholder')));
    });

    await t.test('rejects markdown code fences and leading model chat', () => {
        const result = validateGeneratedLetter({
            ...defaultInput,
            text: '```\n' + defaultInput.text + '\n```'
        });
        assert.strictEqual(result.valid, false);
        assert.ok(result.fatalErrors.some(err => err.includes('code fences')));

        const result2 = validateGeneratedLetter({
            ...defaultInput,
            text: "Here is the letter:\n\n" + defaultInput.text
        });
        assert.strictEqual(result2.valid, false);
        assert.ok(result2.fatalErrors.some(err => err.includes('conversational model commentary')));
    });

    await t.test('rejects missing or duplicate headings', () => {
        // Missing summary
        const result = validateGeneratedLetter({
            ...defaultInput,
            text: defaultInput.text.replace(/Summary/i, 'Overview')
        });
        assert.strictEqual(result.valid, false);
        assert.ok(result.fatalErrors.some(err => err.includes('heading "Summary" is missing')));

        // Duplicate headings
        const result2 = validateGeneratedLetter({
            ...defaultInput,
            text: defaultInput.text + '\n\n# Summary\nDuplicate info.'
        });
        assert.strictEqual(result.valid, false);
        assert.ok(result2.fatalErrors.some(err => err.includes('Duplicate "Summary" headings')));
    });

    await t.test('rejects missing body text between Summary and Impression/Plan', () => {
        const result = validateGeneratedLetter({
            ...defaultInput,
            text: `
# Summary
# Impression and Plan
We will continue monitoring.
Kind regards,
Dr. Smith
            `.trim()
        });
        assert.strictEqual(result.valid, false);
        assert.ok(result.fatalErrors.some(err => err.includes('No substantial body prose')));
    });

    await t.test('rejects example name leakages in the opening sentence', () => {
        const result = validateGeneratedLetter({
            ...defaultInput,
            text: `
# Summary
The patient had a follow-up consultation today. They are feeling well.

# Impression and Plan
We will continue monitoring the current plan.
Kind regards,
Dr. Smith

I had the pleasure of conducting an in-person review with Amy.
            `.trim()
        });
        assert.strictEqual(result.valid, false);
        assert.ok(result.fatalErrors.some(err => err.includes('Example patient name leakage detected in opening')));
    });

    await t.test('accepts example names or individual surnames in clinician headings or body details', () => {
        const result = validateGeneratedLetter({
            ...defaultInput,
            text: `
# Summary
The patient had a follow-up consultation today. They are feeling well.

# Impression and Plan
We will continue monitoring the current plan and discuss with Dr. Johnson.
Kind regards,
Dr. Smith

Dear Dr. Johnson,

I had the pleasure of conducting an in-person review with Jane.
            `.trim(),
            authoritativePatientName: 'Jane Doe'
        });
        assert.strictEqual(result.valid, true);
    });

    await t.test('rejects conflicting GP actions', () => {
        const result = validateGeneratedLetter({
            ...defaultInput,
            text: defaultInput.text + '\nNo action required. Note: action requested for follow-up.'
        });
        assert.strictEqual(result.valid, false);
        assert.ok(result.fatalErrors.some(err => err.includes('Conflicting GP action')));
    });

    await t.test('rejects incorrect name salutation', () => {
        const result = validateGeneratedLetter({
            ...defaultInput,
            text: 'Dear Sarah,\n\n' + defaultInput.text
        });
        assert.strictEqual(result.valid, false);
        assert.ok(result.fatalErrors.some(err => err.includes('Incorrect patient name detected in salutation')));
    });
});

test('Letter Validation Warning Rules', async (t) => {
    const defaultInput = {
        text: `
# Summary
The patient had a follow-up consultation today. They are feeling well.

# Impression and Plan
We will continue monitoring the current plan.
Kind regards,
Dr. Smith
        `.trim(),
        authoritativePatientName: 'Jane Doe',
        transcript: 'Patient follow up today. Feeling well. Keep monitoring.',
        letterType: 'review',
        templateType: 'general',
        metadata: {
            content: '...',
            usage: { input_tokens: 10, output_tokens: 10 },
            finishReason: 'STOP',
            blocked: false,
            model: 'gemini-2.5-flash'
        }
    };

    await t.test('warns when closing sign-off is missing', () => {
        const result = validateGeneratedLetter({
            ...defaultInput,
            text: `
# Summary
The patient had a follow-up consultation today. They are feeling well.

# Impression and Plan
We will continue monitoring the current plan and schedule a follow-up consultation in six months.
            `.trim()
        });
        if (!result.valid) console.log('Fatal errors in missing closing sign-off test:', result.fatalErrors);
        assert.strictEqual(result.valid, true);
        assert.ok(result.warnings.some(w => w.includes('No standard closing sign-off')));
    });

    await t.test('warns when letter length is unusually long', () => {
        const result = validateGeneratedLetter({
            ...defaultInput,
            transcript: 'Short transcript context for testing long output warning rule. '.repeat(10), // > 300 chars
            text: defaultInput.text + '\nExtra verbose sentence for testing the unusually long ratio rule.'.repeat(30)
        });
        if (!result.valid) console.log('Fatal errors in unusually long test:', result.fatalErrors);
        assert.strictEqual(result.valid, true);
        assert.ok(result.warnings.some(w => w.includes('unusually long')));
    });

    await t.test('warns when exam is mentioned but not in transcript', () => {
        const result = validateGeneratedLetter({
            ...defaultInput,
            text: defaultInput.text + '\nOn examination chest was clear.'
        });
        if (!result.valid) console.log('Fatal errors in exam test:', result.fatalErrors);
        assert.strictEqual(result.valid, true);
        assert.ok(result.warnings.some(w => w.includes('examination findings mentioned')));
    });

    await t.test('warns on pronoun inconsistency', () => {
        const result = validateGeneratedLetter({
            ...defaultInput,
            expectedPronouns: 'he',
            text: defaultInput.text + '\nShe felt better. Her recovery is quick. She visited again.'
        });
        if (!result.valid) console.log('Fatal errors in pronoun test:', result.fatalErrors);
        assert.strictEqual(result.valid, true);
        assert.ok(result.warnings.some(w => w.includes('Inconsistent pronouns')));
    });

    await t.test('warns on excessive bullets outside summary', () => {
        const result = validateGeneratedLetter({
            ...defaultInput,
            text: `
# Summary
The patient had a follow-up consultation today.

# Impression and Plan
- Bullet one
- Bullet two
- Bullet three
- Bullet four
- Bullet five
- Bullet six
- Bullet seven
- Bullet eight
- Bullet nine
- Bullet ten
Kind regards,
Dr. Smith
            `.trim()
        });
        if (!result.valid) console.log('Fatal errors in excessive bullets test:', result.fatalErrors);
        assert.strictEqual(result.valid, true);
        assert.ok(result.warnings.some(w => w.includes('Excessive number of bullet points')));
    });
});
