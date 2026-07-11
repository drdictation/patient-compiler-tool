# Implementation Progress

## Commit Boundaries

### 1. Generation contracts, transcript preparation, and tests
- **Status**: Complete
- **Date Completed**: 2026-07-12
- **Commit Hash**: N/A
- **Files Changed**:
  - `src/lib/generation/contracts.ts` (created)
  - `src/lib/generation/transcript.ts` (created)
  - `src/lib/generation/transcript.test.ts` (created)
  - `src/lib/generation/actions.test.ts` (created)
  - `src/app/actions.ts` (modified)
  - `src/lib/letter-post-processing.ts` (modified - fixed lint warnings)
- **Tests Run**: `node --import tsx --env-file=.env --test src/lib/generation/*.test.ts` (18 passing tests)
- **Unresolved Risks / Follow-up Items**:
  - The local production build (`npm run build`) fails due to a pre-existing missing `SUPABASE_SERVICE_ROLE_KEY` in the local environment, which is check-guarded inside `src/lib/supabase.ts`. This key is required for build-time static route collection in Next.js but is not present in `.env`.

### 2. Split orchestration, concurrency, batch task insertion, and UI state
- **Status**: Complete
- **Date Completed**: 2026-07-12
- **Commit Hash**: N/A
- **Files Changed**:
  - `src/app/actions.ts` (modified: added generateClinicalDocuments and extractAndSaveTasks)
  - `src/components/smart-note-dialog.tsx` (modified: concurrent transition flow, new states, asynchronous tasks handler)
  - `src/lib/generation/concurrency.test.ts` (created: concurrent generation check and single-query batch insert check)
- **Tests Run**: `node --import tsx --env-file=.env --test src/lib/generation/*.test.ts` (22 passing tests)
- **Unresolved Risks / Follow-up Items**: None.


### 3. Timeout/retry policy and provider error mapping
- **Status**: Complete
- **Date Completed**: 2026-07-12
- **Commit Hash**: N/A
- **Files Changed**:
  - `src/lib/llm-request.ts` (created: fetch wrapper with named timeouts, error classification, retry limit, and retry-after limit)
  - `src/lib/llm.ts` (modified: migrated callGemini, callGroq, and callOpenRouterGroq to fetchWithRetryAndTimeout, refactored extractGeneric fallback chain to support 1 fallback)
  - `src/app/api/transcribe/route.ts` (modified: migrated Groq Whisper transcriptions fetch to use fetchWithRetryAndTimeout under TRANSCRIPTION budget)
  - `src/lib/generation/llm-request.test.ts` (created: test suite for classification, timeout, and retry limit)
- **Tests Run**: `node --import tsx --env-file=.env --test src/lib/generation/*.test.ts` (29 passing tests)
- **Unresolved Risks / Follow-up Items**: None.

### 4. Letter validator, finish-reason metadata, and UI warnings
- **Status**: Complete
- **Date Completed**: 2026-07-12
- **Commit Hash**: N/A
- **Files Changed**:
  - `src/lib/generation/letter-validation.ts` (created: fatal and warning validation rules)
  - `src/lib/generation/letter-validation.test.ts` (created: test suite for validation fatal and warning rules)
  - `src/lib/generation/contracts.ts` (modified: added warnings property and extended error types)
  - `src/lib/llm.ts` (modified: parsed and returned Gemini candidate safety and finish reasons)
  - `src/app/actions.ts` (modified: integrated validation rules in generateClinicalDocuments and generateAdditionalDocument actions)
  - `src/components/smart-note-dialog.tsx` (modified: added warning state and custom Footer acknowledge layouts)
  - `src/components/create-document-dialog.tsx` (modified: added warnings display logic and footer layout changes)
  - `src/lib/generation/concurrency.test.ts` (modified: updated mock letters to pass validation)
- **Tests Run**: `node --import tsx --env-file=.env --test src/lib/generation/*.test.ts` (49 passing tests)
- **Unresolved Risks / Follow-up Items**: None.

### 5. Instruction/data separation and caller migration
- **Status**: Not Started
- **Date Completed**: N/A
- **Commit Hash**: N/A
- **Files Changed**: N/A
- **Tests Run**: N/A
- **Unresolved Risks / Follow-up Items**: N/A

### 6. Routing correction and safe detailed-mode wording
- **Status**: Not Started
- **Date Completed**: N/A
- **Commit Hash**: N/A
- **Files Changed**: N/A
- **Tests Run**: N/A
- **Unresolved Risks / Follow-up Items**: N/A

### 7. Minimal de-identified baseline fixtures
- **Status**: Not Started
- **Date Completed**: N/A
- **Commit Hash**: N/A
- **Files Changed**: N/A
- **Tests Run**: N/A
- **Unresolved Risks / Follow-up Items**: N/A

### 8. Prompt component refactor and evaluated example cleanup
- **Status**: Not Started
- **Date Completed**: N/A
- **Commit Hash**: N/A
- **Files Changed**: N/A
- **Tests Run**: N/A
- **Unresolved Risks / Follow-up Items**: N/A

### 9. Supabase idempotency migration and atomic persistence
- **Status**: Not Started
- **Date Completed**: N/A
- **Commit Hash**: N/A
- **Files Changed**: N/A
- **Tests Run**: N/A
- **Unresolved Risks / Follow-up Items**: N/A

### 10. Context selection and current-version query optimisation
- **Status**: Not Started
- **Date Completed**: N/A
- **Commit Hash**: N/A
- **Files Changed**: N/A
- **Tests Run**: N/A
- **Unresolved Risks / Follow-up Items**: N/A

### 11. Optional tasks and evaluated output limits
- **Status**: Not Started
- **Date Completed**: N/A
- **Commit Hash**: N/A
- **Files Changed**: N/A
- **Tests Run**: N/A
- **Unresolved Risks / Follow-up Items**: N/A

### 12. Complete evaluation runner and quality gate
- **Status**: Not Started
- **Date Completed**: N/A
- **Commit Hash**: N/A
- **Files Changed**: N/A
- **Tests Run**: N/A
- **Unresolved Risks / Follow-up Items**: N/A
