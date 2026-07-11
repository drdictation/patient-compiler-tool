import { PROMPTS } from '../prompts';
import { GenerationException } from '../generation/contracts';

// ── Valid option values ──────────────────────────────────────────────────────

export const VALID_LETTER_TYPES = ['new', 'review'] as const;
export type LetterType = (typeof VALID_LETTER_TYPES)[number];

export const VALID_TEMPLATE_TYPES = ['general', 'ibd', 'functional', 'oesophageal', 'eoe'] as const;
export type TemplateType = (typeof VALID_TEMPLATE_TYPES)[number];

// ── Prompt key type ──────────────────────────────────────────────────────────

type PromptKey = keyof typeof PROMPTS;

// ── Explicit routing map ─────────────────────────────────────────────────────
// Every valid (templateType, letterType) pair is encoded here.
// No fallthrough, no `(PROMPTS as any)`, no silent defaults.

const LETTER_PROMPT_MAP: Record<TemplateType, Record<LetterType, PromptKey>> = {
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
        // Dedicated new-letter prompt exists; review uses general until evaluated
        new: 'OESOPHAGEAL_NEW_LETTER',
        review: 'REVIEW_LETTER',
    },
    eoe: {
        // Dedicated new-letter prompt exists; review uses general until evaluated
        new: 'EOE_NEW_LETTER',
        review: 'REVIEW_LETTER',
    },
};

// ── resolveLetterPrompt ──────────────────────────────────────────────────────

export interface ResolveLetterPromptInput {
    letterType: string;
    templateType: string;
}

/**
 * Returns the prompt text for a given (letterType, templateType) combination.
 *
 * Throws GenerationException with INVALID_INPUT for unrecognised combinations
 * instead of silently falling back to NEW_LETTER.
 */
export function resolveLetterPrompt({ letterType, templateType }: ResolveLetterPromptInput): string {
    if (!VALID_LETTER_TYPES.includes(letterType as LetterType)) {
        throw new GenerationException(
            'INVALID_INPUT',
            `Invalid letter type: "${letterType}". Valid values: ${VALID_LETTER_TYPES.join(', ')}.`,
            false
        );
    }

    if (!VALID_TEMPLATE_TYPES.includes(templateType as TemplateType)) {
        throw new GenerationException(
            'INVALID_INPUT',
            `Invalid template type: "${templateType}". Valid values: ${VALID_TEMPLATE_TYPES.join(', ')}.`,
            false
        );
    }

    const key = LETTER_PROMPT_MAP[templateType as TemplateType][letterType as LetterType];
    return PROMPTS[key] as string;
}

// ── Detail level ─────────────────────────────────────────────────────────────

export type DetailLevel = 'standard' | 'detailed';

/**
 * Replaces the former COMPLEXITY_DIRECTIVE.
 *
 * Key difference: this directive asks for completeness using ONLY
 * transcript-supported content. It explicitly forbids adding
 * pathophysiology, psychosocial interpretation, medicolegal rationale,
 * diagnoses, or risks that are not present in the transcript.
 */
export const DETAILED_LETTER_DIRECTIVE = `
DETAILED LETTER DIRECTIVE (CRITICAL):
This consultation requires a more comprehensive letter. You MUST:
1. Include ALL transcript-supported active problems, relevant history, investigations, treatment responses, uncertainties, clinical decisions, risks or alternatives actually discussed, and follow-up plans.
2. Preserve the relationships between issues and decisions — show how findings led to clinical reasoning and management choices.
3. Use additional paragraphs where needed to ensure completeness without sacrificing readability.
4. Do NOT add pathophysiology, psychosocial interpretation, medicolegal rationale, diagnoses, or risks unless they are explicitly present in the transcript.
5. Do NOT become repetitive — each piece of information should appear once in its most relevant context.
6. Factual-grounding rules always override the desire for detail. Completeness means capturing everything the transcript supports, not inventing additional content.
`;
