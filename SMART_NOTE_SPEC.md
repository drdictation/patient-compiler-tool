# Smart Note Feature Specification & Architecture

> **STATUS: ✅ PRODUCTION READY & REFACTORED**
> The Smart Note system has been upgraded from a legacy sequential action into a decoupled, concurrent, resilient, and deterministically validated pipeline covered by an automated test suite (78 passing tests in `src/lib/generation/*.test.ts`).

---

## 1. Overview & Core Purpose

The Smart Note pipeline transforms raw consultation audio or pasted transcript text into structured, audit-proof clinical documentation:
1. **Raw Transcript Artifact** (`RAW_TRANSCRIPT`): Normalised, cryptographically hashed, and persisted as the immutable source of truth.
2. **Internal Consult Note** (`INTERNAL_NOTE`): Structured clinician-facing note (SOAP/consult format).
3. **Referrer Letter** (`REFERRER_LETTER`): Specialist letter to the referring general practitioner, tailored by sub-specialty (General, IBD, Functional GI, Oesophageal, EoE) and detail level.
4. **Patient Summary** (`PATIENT_SUMMARY`): Clear, dignified, practical consultation summary email sent directly to the patient, explaining physiological mechanisms and management steps without jargon or condescension.
5. **Actionable Tasks** (`patient_task`): Extracted clinical, administrative, and follow-up tasks with confidence scores and evidence quotes.

---

## 2. Decoupled Architecture & Execution Flow

Rather than a single blocking server action, generation is separated into three distinct lifecycles:

```
                  ┌─────────────────────────────────────────┐
                  │ SmartNoteDialog / MobileConsultSheet UI │
                  └────────────────────┬────────────────────┘
                                       │
                       1. Normalise & Prepare Request
                                       │
                                       ▼
                    ┌──────────────────────────────────────┐
                    │ prepareSmartNoteGeneration(options)  │
                    │  - Validate input bounds (50-250k)   │
                    │  - Unicode NFC normalisation         │
                    │  - Compute SHA-256 transcriptHash    │
                    │  - Server lookup authoritative name  │
                    │  - Ensure encounter & save transcript│
                    │  - Return PreparedSmartNoteContext   │
                    └──────────────────┬───────────────────┘
                                       │
              ┌────────────────────────┴────────────────────────┐
              │ Starts both operations concurrently             │
              ▼                                                 ▼
┌───────────────────────────────────────────────┐ ┌───────────────────────────────────────┐
│ generateClinicalDocuments(context)            │ │ extractAndSaveTasks(context)          │
│                                               │ │                                       │
│ ┌───────────────┐ ┌───────────────┐ ┌───────┐ │ │ - Groq Llama 4 / GPT OSS extraction   │
│ │ Consult Note  │ │ Referrer Ltr  │ │Patient│ │ │ - Bounded timeout (25s)               │
│ │ (gemini-3.1-  │ │ (gpt-5.6-luna)│ │Summary│ │ │ - Single-query batch SQL insert       │
│ │  flash-lite)  │ │               │ │(gemini│ │ │ - Non-blocking background promise     │
│ └───────┬───────┘ └───────┬───────┘ └───┬───┘ │ │ - UI never blocked by task latency    │
│         └─────────────────┼─────────────┘     │ └───────────────────────────────────────┘
│                           ▼                   │
│                 Promise.allSettled()          │
│                           │                   │
│       Deterministic Validation Check (Letter) │
│       - Fatal rules -> block save & error     │
│       - Warnings -> persist + UI warning      │
│                           │                   │
│       Save to Supabase Artifacts Table        │
└───────────────────────────┬───────────────────┘
                            │
                            ▼
                  Return Clinical Result
         (Note, Letter & Summary display in UI)
```

### Key Architectural Decisions:
- **No Cascade Failures**: Note generation, letter generation, and patient summary generation run concurrently using `Promise.allSettled`. Failure in letter generation does not discard a valid note or summary, and vice-versa.
- **Detached Task Ingestion**: Task extraction runs via its own server action promise (`extractAndSaveTasks`). The client displays and saves the clinical documents immediately without waiting for task extraction to finish.
- **Zero Vercel Timeout Violations**: Subdividing preparation, clinical generation, and task extraction into independent operations fits safely within serverless execution limits.

---

## 3. Data Contracts (`src/lib/generation/contracts.ts`)

### `PreparedSmartNoteContext`
```typescript
export interface PreparedSmartNoteContext {
    requestId: string;                    // Cryptographic random UUID
    patientId: string;
    patientName: string;                  // Authoritative display name from DB
    encounterId: string;
    encounterDate: string;                // YYYY-MM-DD
    formattedDate: string;                // e.g. "12 July 2026"
    normalisedTranscript: string;         // NFC normalised, clean line-endings
    transcriptHash: string;               // SHA-256 hex digest
    transcriptArtifactId: string;
    noteType: 'new_consult' | 'review_consult';
    outputs: {
        generateNote: boolean;
        generateLetter: boolean;
        generatePatientSummary?: boolean; // Optional patient summary email
        letterType?: 'new' | 'review';
        templateType?: 'general' | 'ibd' | 'functional' | 'oesophageal' | 'eoe';
        detailLevel?: 'standard' | 'detailed'; // Replaces deprecated isComplex
        pronouns?: 'auto' | 'he_him' | 'she_her' | 'they_them';
    };
    model: SmartNoteModel;
    extractTasks: boolean;
    promptVersion: string;
}
```

### Results & Errors
- `ClinicalGenerationResult`: Contains independent `note?: DocumentGenerationResult`, `letter?: DocumentGenerationResult`, and `patientSummary?: DocumentGenerationResult`.
- `TaskGenerationResult`: Reports `status`, `insertedCount`, `reusedCount`, and optional `error`.
- `GenerationErrorCode`: Strictly typed codes (`INVALID_INPUT`, `TRANSCRIPT_TOO_SHORT`, `TRANSCRIPT_TOO_LARGE`, `TIMEOUT`, `RATE_LIMITED`, `PROVIDER_ERROR`, `INVALID_MODEL_OUTPUT`, `VALIDATION_FAILED`, `PERSISTENCE_FAILED`, `UNKNOWN`).

---

## 4. Prompt Registry & Sub-specialty Routing (`src/lib/prompts/registry.ts`)

The prompt system enforces explicit routing for every `(templateType, letterType)` pair with no silent fallbacks:

| Template Type | Letter Type | Prompt Key | Clinical Focus |
|:---|:---|:---|:---|
| **general** | `new` | `NEW_LETTER` | Comprehensive GI evaluation, baseline history |
| **general** | `review` | `REVIEW_LETTER` | Progress review, treatment response, next steps |
| **ibd** | `new` | `IBD_NEW_LETTER` | Phenotype, disease extent, baseline calprotectin/endoscopy |
| **ibd** | `review` | `IBD_REVIEW_LETTER` | Objective remission, biologics, drug levels, calprotectin |
| **functional** | `new` | `FUNCTIONAL_NEW_LETTER` | Rome IV patterns, diet trials, brain-gut neuromodulators |
| **functional** | `review` | `FUNCTIONAL_REVIEW_LETTER` | Symptom severity evolution, food triggers, motility |
| **oesophageal** | `new` | `OESOPHAGEAL_NEW_LETTER` | Dysphagia, manometry, impedance, reflux metrics |
| **oesophageal** | `review` | `REVIEW_LETTER` | Progress review (routes to standard Review Letter) |
| **eoe** | `new` | `EOE_NEW_LETTER` | Peak eosinophil counts, food elimination, topical steroids |
| **eoe** | `review` | `REVIEW_LETTER` | Histological response, maintenance dilatation (routes to standard Review) |

### Detail Level Directive (`DETAILED_LETTER_DIRECTIVE`)
Replaces the deprecated "Complex Case" directive. Crucially, it instructs the model to provide comprehensive completeness **strictly based on transcript evidence**, and explicitly forbids inventing pathophysiology, psychosocial assumptions, or medicolegal speculation not supported by the transcript.

### Patient Summary Directives (`src/lib/prompts/patient-summary.ts`)
- **Tone**: Respectful, articulate, objective, and direct. Strictly forbids patronising cheerleading clichés ("You've got this!", "Be kind to yourself!") or baby-talk metaphors ("tummy troubles", "happy gut").
- **Clinical Grounding**: Explains 2 to 4 overlapping physiological mechanisms discussed (visceral hypersensitivity, dysmotility, pelvic floor dyssynergia) and management steps (medications with titration, toilet posture & defecation mechanics with footstool instructions, dietary measures, investigations, and red flags).
- **Generated via**: `PATIENT_SUMMARY_MODEL = 'gemini-3.1-flash-lite'`.

---

## 5. Mobile Ingestion & Device Resilience Suite

To support clinicians recording consultations on mobile phones or iPads, the platform includes dedicated client resilience mechanisms:

1. **Mobile Consult Sheet (`src/components/mobile-consult-sheet.tsx`)**:
   - Touch-optimized bottom sheet for phone consulting.
   - Real-time Web Audio API visualizer rendering live audio amplitude bars (24 frequency bins via `AnalyserNode`).
   - Collapsible prior consult notes viewer directly inside the sheet for immediate clinical review during consults.
   - 1-tap toggles for New/Review, Detailed Letter, and Patient Summary.

2. **Screen Wake Lock API (`src/lib/audio/wake-lock.ts`)**:
   - Acquires `navigator.wakeLock.request('screen')` during audio recording and document generation.
   - Prevents smartphones and tablets from dimming or going to standby mid-consultation.
   - Automatically re-acquires the lock if the user leaves and returns to the browser tab (`visibilitychange` listener).

3. **Local IndexedDB Audio Draft Cache (`src/lib/audio/local-cache.ts`)**:
   - Streams audio chunks locally into client-side IndexedDB (`pct_audio_cache`).
   - Audio is strictly buffered on the doctor's phone/browser and **never stored in Supabase**.
   - Cleared automatically immediately upon successful transcription or cancellation.

---

## 6. Deterministic Letter Validation (`src/lib/generation/letter-validation.ts`)

Every generated letter is passed through a deterministic validation engine before persistence:

### Fatal Rules (Prevents Persistence & Throws Error)
1. **Minimum Length**: Must be at least 150 characters.
2. **Finish Reason**: Non-STOP finish reasons or safety blocks (`finishReason !== 'STOP'`).
3. **Template Placeholders**: Any unresolved `{{placeholder}}` strings.
4. **Scaffold Placeholders**: Residual brackets like `[Insert ...]`, `[Key diagnosis]`, `[Body Paragraphs]`.
5. **Code Fences / Commentary**: Leading markdown fences (```` ``` ````) or conversational chatter (`"Here is the letter"`).
6. **Required Headings**: Must contain exactly one `Summary` and one `Impression and Plan` heading.
7. **Body Prose Existence**: Must contain substantial prose between Summary and Impression/Plan.
8. **Few-Shot Name Leakage**: Verifies synthetic names from examples (e.g. `David Miller`, `Sarah Jenkins`) do not appear in the opening paragraph.
9. **GP Action Contradiction**: Flags letters stating both "Action required" and "No action required".
10. **Salutation Mismatch**: Detects wrong patient name in salutations (`"Dear John"` when patient is Jane).

### Warning Rules (Persisted with Non-blocking Clinician Warnings in UI)
1. Missing standard closing sign-off (`"Kind regards"`, `"Yours sincerely"`).
2. Unusually long expansion ratio (> 3x transcript length).
3. GP Action requested in letter with zero action keywords in the source transcript.
4. Physical examination findings mentioned when transcript contains no examination terminology.
5. Inconsistent pronouns compared to selected option.
6. Excessive bullet points outside the Summary section.

---

## 7. Timeout Budgets & Resilience (`src/lib/llm-request.ts`)

Network requests are wrapped with operational budgets and intelligent retry policies:

| Operation | Timeout Budget | Max Retries | Retryable Conditions |
|:---|:---|:---|:---|
| `CLINICAL_GENERATION` | 55 seconds | 1 | 429, 500, 502, 503, 504, Timeout |
| `STRUCTURED_EXTRACTION` | 25 seconds | 1 | 429, 500, 502, 503, 504, Timeout |
| `TRANSCRIPTION` | 55 seconds | 1 | 429, 500, 502, 503, 504, Timeout |

- **Non-retryable**: 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found fail immediately without wasting time or quota.
- **Retry-After Support**: Automatically honours upstream HTTP `Retry-After` headers (capped at 10s).

---

## 8. Active Model Configuration (`src/lib/model-config.ts`)

Clinical document generation uses specialized models configured centrally:
- **`CONSULT_LETTER_MODEL`**: `gpt-5.6-luna` (OpenAI Responses API) — optimized for nuanced medical phrasing and Australian specialist formatting.
- **`CONSULT_NOTE_MODEL`**: `gemini-3.1-flash-lite` (Google Generative Language API) — fast, high-throughput SOAP structure.
- **`PATIENT_SUMMARY_MODEL`**: `gemini-3.1-flash-lite` (Google Generative Language API) — empathetic, articulate, non-patronising patient communication.
- **Task Extraction**: Groq Llama 4 Scout (`meta-llama/llama-4-scout-17b-16e-instruct`) or GPT OSS 120B.
- **Audio Transcription**: Groq Whisper (`whisper-large-v3`).

---

## 9. Testing & Verification

Run the full automated test suite covering generation contracts, concurrency, validation, prompt injection, timeouts, and routing:
```bash
node --import tsx --env-file=.env --test src/lib/generation/*.test.ts
```
Expected result: **78 passing tests across 6 test suites**.
