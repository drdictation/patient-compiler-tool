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
