/** Client-safe model identifiers used by clinical document generation. */
export type SmartNoteModel =
    | 'gemini-2.5-flash'
    | 'gemini-3-flash-preview'
    | 'gemini-3.0-flash'
    | 'gemini-3.1-flash-lite-preview'
    | 'gemini-3.1-flash-lite'
    | 'gpt-5.6-luna';

export const CONSULT_NOTE_MODEL: SmartNoteModel = 'gemini-3.1-flash-lite';
export const CONSULT_LETTER_MODEL: SmartNoteModel = 'gpt-5.6-luna';
