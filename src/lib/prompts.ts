/**
 * Smart Note Prompts
 * 
 * Placeholder prompts for generating clinical notes and letters from transcripts.
 * These will be replaced with actual prompts provided by the user.
 */

import { NEW_CONSULT_NOTE } from './prompts/new-consult-note';
import { REVIEW_CONSULT_NOTE } from './prompts/review-consult-note';
import { NEW_LETTER } from './prompts/new-letter';
import { REVIEW_LETTER } from './prompts/review-letter';
import { TASK_EXTRACTION_PROMPT } from './prompts/task-extraction';
import { IBD_NEW_LETTER } from './prompts/ibd-new-letter';
import { IBD_REVIEW_LETTER } from './prompts/ibd-review-letter';
import { FUNCTIONAL_NEW_LETTER } from './prompts/functional-new-letter';
import { FUNCTIONAL_REVIEW_LETTER } from './prompts/functional-review-letter';
import { OESOPHAGEAL_NEW_LETTER } from './prompts/oesophageal-new-letter';
import { EOE_NEW_LETTER } from './prompts/eoe-new-letter';
import { OUTBOUND_REFERRAL_LETTER } from './prompts/outbound-referral-letter';
import { PATIENT_SUMMARY } from './prompts/patient-summary';

export const PROMPTS = {
    NEW_CONSULT_NOTE,
    REVIEW_CONSULT_NOTE,
    NEW_LETTER,
    REVIEW_LETTER,
    IBD_NEW_LETTER,
    IBD_REVIEW_LETTER,
    FUNCTIONAL_NEW_LETTER,
    FUNCTIONAL_REVIEW_LETTER,
    OESOPHAGEAL_NEW_LETTER,
    EOE_NEW_LETTER,
    OUTBOUND_REFERRAL_LETTER,
    PATIENT_SUMMARY
};

export type LetterTemplateType = 'general' | 'ibd' | 'functional' | 'oesophageal' | 'eoe';


export const SMART_NOTE_PROMPTS = {
    /**
     * Prompt for generating a NEW consult note from a transcript.
     * Used when this is the first time seeing a patient.
     */
    NEW_CONSULT_NOTE,

    /**
     * Prompt for generating a REVIEW consult note from a transcript.
     * Used for follow-up visits.
     */
    REVIEW_CONSULT_NOTE,

    /**
     * Prompt for generating a NEW referral letter.
     * Used when referring a patient for the first time.
     */
    NEW_LETTER,

    /**
     * Prompt for generating a REVIEW/follow-up letter.
     * Used for updating the referrer on patient progress.
     */
    REVIEW_LETTER,
} as const;

export type SmartNotePromptKey = keyof typeof SMART_NOTE_PROMPTS;

/**
 * Prompt for extracting actionable tasks from consultation transcripts.
 * Used by the Smart Note feature to auto-generate a task list.
 */
export { TASK_EXTRACTION_PROMPT };

export const EXAMPLE_PATIENT_NAMES = ['Amy', 'Bailey', 'Margot', 'Michael', 'Amanda', 'Richard', 'Phoebe'];
