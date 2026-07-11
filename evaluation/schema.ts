/**
 * Evaluation Fixture Schema
 *
 * Defines the structure of a de-identified evaluation fixture used to
 * measure prompt quality before and after prompt changes.
 *
 * Rules:
 * - All patient details are SYNTHETIC. Never commit real patient data.
 * - De-identification must be manual and verified before committing.
 * - clinicianReviewed must be true before a fixture may be used in
 *   Boundary 8 prompt-change comparisons.
 */

// ── Consult options ───────────────────────────────────────────────────────────

export type NoteType = 'new_consult' | 'review_consult';
export type LetterType = 'new' | 'review';
export type TemplateType = 'general' | 'ibd' | 'functional' | 'oesophageal' | 'eoe';
export type DetailLevel = 'standard' | 'detailed';

export interface ConsultOptions {
    noteType: NoteType;
    letterType: LetterType;
    templateType: TemplateType;
    /** Whether to use the detailed-mode directive. Default: standard. */
    detailLevel?: DetailLevel;
    /** Explicit pronoun directive if needed. Default: auto. */
    pronouns?: 'auto' | 'he_him' | 'she_her' | 'they_them';
}

// ── Required facts ────────────────────────────────────────────────────────────

/**
 * Facts that must appear in a correctly generated letter.
 * Each entry is a string that should be matched (case-insensitive substring
 * or one of the allowedPhrasings alternatives).
 */
export interface RequiredFacts {
    /** Drug names and doses that must appear. */
    medications: string[];
    /** Diagnoses or clinical findings that must appear. */
    diagnoses: string[];
    /** Investigations mentioned (completed or planned). */
    investigations: string[];
    /** Follow-up plans or timeframes. */
    followUp: string[];
    /** GP action statements (e.g. "refer for colonoscopy"). */
    gpActions: string[];
}

// ── GP action expectation ─────────────────────────────────────────────────────

/**
 * Expected GP-action state.
 * - 'action'    — transcript clearly supports a GP action.
 * - 'no_action' — transcript clearly states no action required.
 * - 'unclear'   — transcript does not definitively establish either.
 */
export type GpActionExpected = 'action' | 'no_action' | 'unclear';

// ── Full fixture ──────────────────────────────────────────────────────────────

export interface EvaluationFixture {
    /** Unique fixture identifier, e.g. "fixture-01-general-new". */
    id: string;

    /** Human-readable description of what this fixture tests. */
    description: string;

    /** Synthetic patient name — must NOT be a real person's name. */
    patientName: string;

    /** Synthetic patient identifier — must NOT be a real MRN or DOB. */
    patientId: string;

    /** Generation options to use when running this fixture. */
    consultOptions: ConsultOptions;

    /**
     * The synthetic, de-identified consultation transcript.
     * Must not contain real names, dates of birth, addresses, phone
     * numbers, or verbatim identifying histories.
     */
    transcript: string;

    /**
     * Facts that must appear in the generated letter.
     * Annotated by the clinician before use in evaluation.
     */
    requiredFacts: RequiredFacts;

    /**
     * Facts that must NOT appear in the generated letter.
     * Used to detect hallucination or example-name leakage.
     */
    forbiddenFacts: string[];

    /**
     * Alternative phrasings accepted for required facts.
     * Maps a canonical fact string to its acceptable alternatives.
     */
    allowedPhrasings: Record<string, string[]>;

    /**
     * Sections that must be present in the letter output.
     * Typically ["Summary", "Impression and Plan"].
     */
    requiredSections: string[];

    /** Expected GP-action state for this fixture. */
    gpActionExpected: GpActionExpected;

    /**
     * Set to true once the primary clinician has reviewed and
     * corrected all requiredFacts, forbiddenFacts, and gpActionExpected.
     * Fixtures with clinicianReviewed=false must not be used as
     * evaluation gates for prompt changes.
     */
    clinicianReviewed: boolean;

    /** Prompt version active when this fixture was created. */
    promptVersion: string;

    /** ISO 8601 creation date. */
    createdAt: string;
}
