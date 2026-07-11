import { SmartNoteModel } from '../llm';

export interface GenerationRequest {
    systemInstructions: string;
    taskInstructions?: string;
    transcript: string;
    metadata: {
        patientName: string;
        date?: string;
        documentType: string; // e.g. "smart_note", "referrer_letter", "referral_letter", etc.
        templateType: string; // e.g. "general", "ibd", "functional", etc.
        pronouns?: string;
    };
    model: SmartNoteModel;
    purpose: string;
    patientId?: string;
    requestId?: string;
    promptVersion?: string;
    outputTokenLimit?: number;
}
