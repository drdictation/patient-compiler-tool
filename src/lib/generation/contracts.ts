import { SmartNoteModel } from '../llm';

export type GenerationStatus = 'success' | 'failed' | 'skipped' | 'reused';

export type GenerationErrorCode =
    | 'INVALID_INPUT'
    | 'TRANSCRIPT_TOO_SHORT'
    | 'TRANSCRIPT_TOO_LARGE'
    | 'TIMEOUT'
    | 'RATE_LIMITED'
    | 'PROVIDER_ERROR'
    | 'INVALID_MODEL_OUTPUT'
    | 'VALIDATION_FAILED'
    | 'PERSISTENCE_FAILED'
    | 'UNKNOWN';

export interface GenerationError {
    code: GenerationErrorCode;
    message: string;
    retryable?: boolean;
}

export class GenerationException extends Error {
    public code: GenerationErrorCode;
    public retryable: boolean;

    constructor(code: GenerationErrorCode, message: string, retryable: boolean = false) {
        super(message);
        this.code = code;
        this.retryable = retryable;
        this.name = 'GenerationException';
    }
}

export interface PreparedSmartNoteContext {
    requestId: string;
    patientId: string;
    patientName: string;
    encounterId: string;
    encounterDate: string; // YYYY-MM-DD
    formattedDate: string;
    normalisedTranscript: string;
    transcriptHash: string;
    transcriptArtifactId: string;
    noteType: 'new_consult' | 'review_consult';
    outputs: {
        generateNote: boolean;
        generateLetter: boolean;
        letterType?: 'new' | 'review';
        templateType?: 'general' | 'ibd' | 'functional' | 'oesophageal' | 'eoe';
        isComplex?: boolean;
        pronouns?: 'auto' | 'he_him' | 'she_her' | 'they_them';
    };
    model: SmartNoteModel;
    extractTasks: boolean;
    promptVersion: string;
}

export interface DocumentGenerationResult {
    status: GenerationStatus;
    artifactId?: string;
    content?: string;
    error?: GenerationError;
}

export interface ClinicalGenerationResult {
    note?: DocumentGenerationResult;
    letter?: DocumentGenerationResult;
}

export interface TaskGenerationResult {
    status: GenerationStatus;
    insertedCount: number;
    reusedCount: number;
    error?: GenerationError;
}
