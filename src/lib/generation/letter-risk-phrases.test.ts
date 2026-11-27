import { test } from 'node:test';
import * as assert from 'node:assert';
import { scanLetterRiskPhrases, hasLetterRiskPhrases } from './letter-risk-phrases';

test('Letter Risk Phrase Scanner — True Positives', async (t) => {
    const positiveCases = [
        {
            name: 'user reported awful phrase: information was not recorded in the consultation',
            text: 'She takes a daily supplement, although the information was not recorded in the consultation.',
            expectedCategory: 'meta_omission',
        },
        {
            name: 'no medication list reviewed during consultation',
            text: 'No medication list was reviewed during the consultation.',
            expectedCategory: 'meta_omission',
        },
        {
            name: 'doses not established during our discussion',
            text: 'The doses were not established during our discussion.',
            expectedCategory: 'meta_omission',
        },
        {
            name: 'duration of treatment not established clearly',
            text: 'The duration of treatment was discussed, although was not established clearly.',
            expectedCategory: 'meta_omission',
        },
        {
            name: 'report not available at consultation',
            text: 'She has also had an abdominal CT, although the report was not available at the consultation.',
            expectedCategory: 'meta_omission',
        },
        {
            name: 'agent injected was not clear',
            text: 'He has had a good response to an injection in his wrist, although the agent injected was not clear.',
            expectedCategory: 'meta_omission',
        },
        {
            name: 'current weight is not known',
            text: 'Her current weight is not known.',
            expectedCategory: 'meta_omission',
        },
        {
            name: 'nature of bowel problems is not known',
            text: 'Both parents had bowel problems, although the nature of these is not known.',
            expectedCategory: 'meta_omission',
        },
        {
            name: 'unclear from our discussion',
            text: 'The effect of this surgery on her nausea and vomiting was not clear from our discussion.',
            expectedCategory: 'transcript_meta',
        },
        {
            name: 'direct transcript/dictation reference',
            text: 'Based on the transcript, she continues on mesalazine.',
            expectedCategory: 'transcript_meta',
        },
        {
            name: 'standalone no physical examination boilerplate (in-person)',
            text: 'A formal physical examination was not undertaken.',
            expectedCategory: 'no_exam_boilerplate',
        },
        {
            name: 'unresolved placeholder and inaudible marker',
            text: 'We will review [Insert date] after the (inaudible) test.',
            expectedCategory: 'placeholder_leak',
        },
        {
            name: 'AI chatter leakage',
            text: 'As an AI, I cannot confirm the dosage.',
            expectedCategory: 'ai_chatter',
        },
    ];

    for (const c of positiveCases) {
        await t.test(c.name, () => {
            const matches = scanLetterRiskPhrases(c.text);
            assert.ok(matches.length > 0, `Expected match for: "${c.text}"`);
            assert.strictEqual(hasLetterRiskPhrases(c.text), true);
            assert.ok(
                matches.some(m => m.category === c.expectedCategory),
                `Expected category ${c.expectedCategory}, got ${matches.map(m => m.category).join(', ')}`
            );
        });
    }
});

test('Letter Risk Phrase Scanner — Clinical False-Positive Guards', async (t) => {
    const safeClinicalSentences = [
        'This was a telehealth consultation; no physical examination was performed.',
        'No physical examination was performed during this telephone consultation.',
        'Biopsy was not undertaken because of the risk of significant haemorrhage.',
        'The cause of her recurrent iron deficiency remains unclear, despite extensive investigation.',
        'She has not reported dysphagia or reflux symptoms.',
        'She completed six gut-focused hypnotherapy recording sessions with good benefit.',
        'We will arrange a repeat colonoscopy in three years for polyp surveillance.',
        'Kind regards,\nDr. Smith',
    ];

    for (const sentence of safeClinicalSentences) {
        await t.test(`ignores safe clinical prose: "${sentence.slice(0, 55)}..."`, () => {
            const matches = scanLetterRiskPhrases(sentence);
            assert.strictEqual(
                matches.length,
                0,
                `Unexpected risk match on safe clinical prose: ${JSON.stringify(matches)}`
            );
            assert.strictEqual(hasLetterRiskPhrases(sentence), false);
        });
    }
});

test('Letter Risk Phrase Scanner — Non-overlapping spans', () => {
    const text = 'The details were not recorded in the consultation and the doses were not established during our discussion.';
    const matches = scanLetterRiskPhrases(text);
    assert.ok(matches.length >= 2);
    for (let i = 1; i < matches.length; i++) {
        assert.ok(matches[i].startIndex >= matches[i - 1].endIndex, 'Spans must not overlap');
    }
});
