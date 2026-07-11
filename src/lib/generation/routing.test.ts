import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    resolveLetterPrompt,
    VALID_LETTER_TYPES,
    VALID_TEMPLATE_TYPES,
    DETAILED_LETTER_DIRECTIVE,
} from '../prompts/registry';
import { PROMPTS } from '../prompts';
import { GenerationException } from './contracts';

// ── resolveLetterPrompt: valid pairs ─────────────────────────────────────────

describe('resolveLetterPrompt — valid pairs', () => {
    const expectedMap: Record<string, Record<string, string>> = {
        general: {
            new: 'NEW_LETTER',
            review: 'REVIEW_LETTER',
        },
        ibd: {
            new: 'IBD_NEW_LETTER',
            review: 'IBD_REVIEW_LETTER',
        },
        functional: {
            new: 'FUNCTIONAL_NEW_LETTER',
            review: 'FUNCTIONAL_REVIEW_LETTER',
        },
        oesophageal: {
            new: 'OESOPHAGEAL_NEW_LETTER',
            review: 'REVIEW_LETTER', // NOT FUNCTIONAL_REVIEW_LETTER
        },
        eoe: {
            new: 'EOE_NEW_LETTER',
            review: 'REVIEW_LETTER', // NOT FUNCTIONAL_REVIEW_LETTER
        },
    };

    for (const template of VALID_TEMPLATE_TYPES) {
        for (const letter of VALID_LETTER_TYPES) {
            const expectedKey = expectedMap[template][letter];
            it(`${template} + ${letter} → ${expectedKey}`, () => {
                const result = resolveLetterPrompt({ letterType: letter, templateType: template });
                const expected = (PROMPTS as Record<string, string>)[expectedKey];
                assert.ok(result, 'resolved prompt should not be empty');
                assert.strictEqual(result, expected, `Expected prompt key ${expectedKey}`);
            });
        }
    }
});

// ── resolveLetterPrompt: oesophageal/EoE review routing fix ──────────────────

describe('resolveLetterPrompt — oesophageal/EoE review must NOT route to FUNCTIONAL_REVIEW_LETTER', () => {
    const FUNCTIONAL_REVIEW = (PROMPTS as Record<string, string>)['FUNCTIONAL_REVIEW_LETTER'];

    it('oesophageal + review does not return FUNCTIONAL_REVIEW_LETTER', () => {
        const result = resolveLetterPrompt({ letterType: 'review', templateType: 'oesophageal' });
        assert.notStrictEqual(result, FUNCTIONAL_REVIEW,
            'oesophageal review should not route to FUNCTIONAL_REVIEW_LETTER');
    });

    it('eoe + review does not return FUNCTIONAL_REVIEW_LETTER', () => {
        const result = resolveLetterPrompt({ letterType: 'review', templateType: 'eoe' });
        assert.notStrictEqual(result, FUNCTIONAL_REVIEW,
            'eoe review should not route to FUNCTIONAL_REVIEW_LETTER');
    });
});

// ── resolveLetterPrompt: invalid combinations ────────────────────────────────

describe('resolveLetterPrompt — invalid combinations', () => {
    it('throws INVALID_INPUT for unknown letterType', () => {
        assert.throws(
            () => resolveLetterPrompt({ letterType: 'followup', templateType: 'general' }),
            (err: any) => {
                assert.ok(err instanceof GenerationException);
                assert.strictEqual(err.code, 'INVALID_INPUT');
                assert.ok(err.message.includes('followup'));
                return true;
            }
        );
    });

    it('throws INVALID_INPUT for unknown templateType', () => {
        assert.throws(
            () => resolveLetterPrompt({ letterType: 'new', templateType: 'hepatology' }),
            (err: any) => {
                assert.ok(err instanceof GenerationException);
                assert.strictEqual(err.code, 'INVALID_INPUT');
                assert.ok(err.message.includes('hepatology'));
                return true;
            }
        );
    });

    it('throws INVALID_INPUT for empty letterType', () => {
        assert.throws(
            () => resolveLetterPrompt({ letterType: '', templateType: 'general' }),
            (err: any) => {
                assert.ok(err instanceof GenerationException);
                assert.strictEqual(err.code, 'INVALID_INPUT');
                return true;
            }
        );
    });

    it('throws INVALID_INPUT for empty templateType', () => {
        assert.throws(
            () => resolveLetterPrompt({ letterType: 'new', templateType: '' }),
            (err: any) => {
                assert.ok(err instanceof GenerationException);
                assert.strictEqual(err.code, 'INVALID_INPUT');
                return true;
            }
        );
    });

    it('is not retryable', () => {
        try {
            resolveLetterPrompt({ letterType: 'unknown', templateType: 'general' });
            assert.fail('should have thrown');
        } catch (err: any) {
            assert.strictEqual(err.retryable, false);
        }
    });
});

// ── All valid pairs are covered ──────────────────────────────────────────────

describe('resolveLetterPrompt — exhaustive coverage', () => {
    it('covers all combinations without throwing', () => {
        let count = 0;
        for (const template of VALID_TEMPLATE_TYPES) {
            for (const letter of VALID_LETTER_TYPES) {
                assert.doesNotThrow(() => {
                    const result = resolveLetterPrompt({ letterType: letter, templateType: template });
                    assert.ok(typeof result === 'string' && result.length > 0);
                });
                count++;
            }
        }
        // 5 templates × 2 letter types = 10 combinations
        assert.strictEqual(count, 10);
    });
});

// ── DETAILED_LETTER_DIRECTIVE content checks ─────────────────────────────────

describe('DETAILED_LETTER_DIRECTIVE', () => {
    it('is a non-empty string', () => {
        assert.ok(typeof DETAILED_LETTER_DIRECTIVE === 'string');
        assert.ok(DETAILED_LETTER_DIRECTIVE.trim().length > 100);
    });

    it('contains grounding language', () => {
        const lower = DETAILED_LETTER_DIRECTIVE.toLowerCase();
        assert.ok(lower.includes('do not add'), 'should contain "do not add"');
        assert.ok(
            lower.includes('unless') && lower.includes('transcript'),
            'should contain "unless...transcript"'
        );
        assert.ok(lower.includes('factual-grounding'), 'should contain "factual-grounding"');
    });

    it('does NOT contain old pathophysiology/medicolegal language', () => {
        const lower = DETAILED_LETTER_DIRECTIVE.toLowerCase();
        assert.ok(!lower.includes('pathophysiological pathways'),
            'should not mention "pathophysiological pathways"');
        assert.ok(!lower.includes('medicolegal reasoning'),
            'should not mention "medicolegal reasoning"');
        assert.ok(!lower.includes('psychosocial complexities'),
            'should not mention "psychosocial complexities"');
        assert.ok(!lower.includes('exhaustive, explanatory clinical style'),
            'should not contain old COMPLEXITY_DIRECTIVE phrasing');
    });

    it('instructs completeness without inventing content', () => {
        const lower = DETAILED_LETTER_DIRECTIVE.toLowerCase();
        assert.ok(lower.includes('all transcript-supported'),
            'should instruct "all transcript-supported"');
        assert.ok(lower.includes('do not become repetitive'),
            'should warn against repetition');
    });
});

// ── VALID_LETTER_TYPES and VALID_TEMPLATE_TYPES constants ────────────────────

describe('exported constants', () => {
    it('VALID_LETTER_TYPES contains new and review', () => {
        assert.deepStrictEqual([...VALID_LETTER_TYPES], ['new', 'review']);
    });

    it('VALID_TEMPLATE_TYPES contains all 5 specialties', () => {
        assert.deepStrictEqual(
            [...VALID_TEMPLATE_TYPES],
            ['general', 'ibd', 'functional', 'oesophageal', 'eoe']
        );
    });
});
