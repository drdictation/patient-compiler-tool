# Application Review: Clinical Letter Generation

## Executive summary

The application has a straightforward core pipeline, but a single Smart Note action currently performs up to three LLM calls in sequence: consult note generation, letter generation, and task extraction. The letter call is also burdened by prompts ranging from roughly 200 to 1,600 words before the transcript is added. Several prompts contain long, imperfect clinical examples and contradictory formatting/style instructions. These choices increase latency and token cost and, more importantly, create avoidable opportunities for example facts, unsupported diagnoses, and incorrect GP actions to leak into generated letters.

The best benefit-to-effort improvements are:

1. Run the independent note, letter, and task calls concurrently after saving the transcript.
2. Add deterministic preflight and post-generation validation (non-empty transcript, size limits, finish reason, required/forbidden sections, patient-name mismatch, placeholder leakage, and explicit GP-action checks).
3. Make generation idempotent using an input fingerprint and disable repeat submission beyond the current component state.
4. Shorten and standardise the letter prompts, retaining at most one carefully curated style example per family.
5. Stop sending duplicate representations of the same consult when generating additional documents.

These changes require no paid infrastructure and fit the intended Vercel Hobby and Supabase Free deployment.

## Scope and method

This was a static review of the repository, with approximately 80% of attention devoted to the LLM/transcript pipeline and 20% to surrounding persistence, API, and frontend behaviour. No code was changed. The review traced pasted and recorded transcripts from the Smart Note dialog through transcription, prompt selection, Gemini/Groq calls, post-processing, Supabase persistence, and UI refresh. It also reviewed related extraction and additional-document paths because they share the same LLM and artifact infrastructure.

No automated test suite or representative transcript/gold-letter evaluation set is present in the repository, so output-quality conclusions are based on prompt and control-flow analysis rather than measured clinical accuracy.

## End-to-end workflow

1. `src/components/smart-note-dialog.tsx` accepts pasted text or records Opus/WebM audio in browser memory.
2. Recorded audio is divided into sub-4.5 MB segments and uploaded sequentially to `src/app/api/transcribe/route.ts`.
3. Each segment is transcribed independently with Groq `whisper-large-v3`; segment texts are concatenated without overlap reconciliation or speaker labelling.
4. `createSmartNote` in `src/app/actions.ts` finds or creates an encounter and saves a new raw-transcript artifact version.
5. It generates an internal note with Gemini if requested.
6. It selects a general or disease-specific letter prompt, appends style/complexity/pronoun directives, and generates the referrer letter with Gemini.
7. It applies regex-based formatting cleanup and saves a new letter artifact version.
8. It always performs a separate Groq task-extraction call and inserts tasks one row at a time.
9. The client waits for the entire server action, displays aggregate success/error state, closes the dialog after 1.5 seconds, and refreshes the route.

The main Smart Note path is therefore serial:

`save transcript -> generate/save note -> generate/save letter -> extract/insert tasks -> refresh`

## Prioritised findings

### P0 — Highest benefit for least effort

#### 1. Independent LLM calls run serially

- **Code location:** `src/app/actions.ts:668-758`
- **Why it matters:** Note generation, letter generation, and task extraction all depend on the same immutable transcript but not on one another. Running them sequentially adds their full latencies and increases the chance that the Vercel function reaches its execution limit. The user cannot see the letter until optional task extraction has also completed.
- **Recommendation:** After ensuring the encounter and saving the transcript, construct the selected prompts once and run requested note generation, letter generation, and task extraction with `Promise.allSettled`. Save each result as it completes or in a second parallel persistence phase. Preserve the existing partial-failure semantics. If the primary UX goal is the letter, do not make task insertion block returning the letter result.
- **Expected impact:** **Quality:** Neutral. **Speed:** High; elapsed LLM time approaches the slowest call rather than the sum. **Cost:** Neutral.
- **Implementation difficulty:** Low–Medium.

#### 2. No idempotency or duplicate-generation protection

- **Code location:** `src/components/smart-note-dialog.tsx:307-377,455-462`; `src/app/actions.ts:510-573,629-768`; `supabase_migration_tasks.sql:5-31`
- **Why it matters:** The button is disabled while this component's transition is pending, but retries after a timeout, double invocation from another tab, reconnects, or repeated clicks after partial success cause all LLM calls to run again. `saveArtifact` always creates a new version and task inserts have no uniqueness constraint, so identical generations consume tokens, create duplicate versions, and duplicate suggested tasks.
- **Recommendation:** Compute a server-side SHA-256 fingerprint from patient, encounter date, normalised transcript, prompt/template version, options, and model. Persist a generation record or fingerprint metadata and return an existing successful result for the same key. At minimum, check whether the latest raw transcript and requested outputs match before calling an LLM, and add a task deduplication key such as `(source_artifact_id, normalised task description)`. Use a short-lived client submission UUID to make retries safe.
- **Expected impact:** **Quality:** Medium (prevents conflicting duplicate drafts/tasks). **Speed:** High on retries. **Cost:** High reduction for repeated submissions.
- **Implementation difficulty:** Medium.

#### 3. Generated letters have almost no semantic or structural validation

- **Code location:** `src/lib/llm.ts:653-713`; `src/app/actions.ts:719-729,1352-1372`; `src/lib/letter-post-processing.ts:7-38`
- **Why it matters:** Any non-empty model text is accepted and saved. The code does not inspect Gemini `finishReason`, safety/block metadata, truncation, leaked placeholders, wrong patient name, missing plan, unsupported GP-action wording, or model commentary. Regex cleanup can improve presentation but cannot detect clinical omissions or hallucinations. An empty response is explicitly checked only in the additional-document path.
- **Recommendation:** Add a cheap deterministic validator before persistence. Reject or flag: empty/very short output, non-`STOP` finish reasons, unresolved `{{...}}` or bracket placeholders, unexpected patient names from style examples, duplicate sections, missing Summary/Impression and Plan, multiple/conflicting GP-action bullets, and obvious meta-commentary/code fences. Validate that an “Action required” statement has a close textual anchor in the transcript; otherwise require clinician review rather than silently asserting it. Return the draft with warnings when safe rather than automatically making a second LLM call. Never use an automatic LLM “repair” unless validation fails and the repair is bounded, because that would add cost and hallucination risk.
- **Expected impact:** **Quality:** High. **Speed:** Negligible overhead. **Cost:** Neutral or lower than blind retries.
- **Implementation difficulty:** Low–Medium.

#### 4. Letter prompts are oversized and inconsistent

- **Code location:** `src/lib/prompts/new-letter.ts`; `review-letter.ts`; `ibd-review-letter.ts`; `functional-review-letter.ts`; other `*letter.ts` files; `src/app/actions.ts:691-717`
- **Why it matters:** Prompt sizes vary dramatically (approximately 220–1,600 words), and multiple files restate the same role, formatting, extraction, and hallucination rules. More prompt tokens increase latency and cost on every generation. Divergent copies also produce inconsistent behaviour: some prompts require first-person dictated style, others “formal third-person”; bolding and bullet rules differ; the appended natural-style directive can contradict the base prompt's permitted plan bullets.
- **Recommendation:** Define one compact shared clinical safety contract, one output schema/structure, and small template-specific guidance blocks. Keep a single reviewed style example only where it demonstrably improves output. Remove repeated explanations and placeholder scaffolding. Version the prompt bundle explicitly so results and evaluation can be compared after changes.
- **Expected impact:** **Quality:** High through consistency. **Speed:** Medium. **Cost:** Medium–High input-token reduction.
- **Implementation difficulty:** Medium.

#### 5. Few-shot examples contain errors and clinically dangerous copy targets

- **Code location:** `src/lib/prompts/review-letter.ts:64-129`; `ibd-review-letter.ts:38-78`; `functional-review-letter.ts:33-76`
- **Why it matters:** The examples include patient names, medications, doses, procedures, follow-up periods, and GP-action language. Some contain transcription errors, unfinished prose, duplicated words, malformed sentences, and direct-referral text. Calling these “PERFECTLY FORMATTED” increases the chance the model copies factual details or undesirable defects. The IBD example at `ibd-review-letter.ts:67` even includes an informal referral request and personal names immediately before the real task.
- **Recommendation:** Remove weak examples first. Replace remaining examples with synthetic, fact-minimal style anchors that cannot be confused with real patient data, and label example boundaries clearly. Prefer one positive example plus concise negative constraints. Add a deterministic check that none of the synthetic example identifiers appear in output.
- **Expected impact:** **Quality:** High. **Speed:** Medium. **Cost:** Medium–High.
- **Implementation difficulty:** Low–Medium.

#### 6. The “complex case” directive encourages unsupported elaboration

- **Code location:** `src/app/actions.ts:575-582,712-714,1331-1333`; UI description at `src/components/smart-note-dialog.tsx:717-727`
- **Why it matters:** Requiring exhaustive physiological/pathophysiological pathways and medicolegal reasoning can force the model to invent mechanisms or rationale that were not in the transcript. This directly conflicts with the base prompts' transcript-only rule. It also expands output tokens substantially.
- **Recommendation:** Reframe complexity as completeness, not elaboration: preserve every transcript-supported problem, uncertainty, decision, risk discussion, and follow-up, but do not add background pathophysiology or medicolegal rationale unless explicitly discussed. Put the transcript-only rule after the complexity directive so it has final precedence. Rename the UI option to “Detailed (transcript-supported)” and cap the expected length.
- **Expected impact:** **Quality:** High (lower hallucination risk). **Speed:** Medium. **Cost:** Medium.
- **Implementation difficulty:** Low.

### P1 — Strong next improvements

#### 7. Prompt/data boundaries are weak and transcript instructions can override the task

- **Code location:** `src/lib/llm.ts:639-655`; all prompt templates ending in `{{TRANSCRIPT}}`; `src/app/actions.ts:1347-1360`
- **Why it matters:** The transcript is interpolated into the same text part as all instructions, with no strong untrusted-data boundary. A transcript may naturally contain phrases such as “write in the letter...” or pasted content that resembles instructions. The model can treat those as higher-priority generation rules. In `generateAdditionalDocument`, an already-filled prompt is passed to a function that performs placeholder substitution again, making prompt ownership difficult to reason about.
- **Recommendation:** Send stable instructions as Gemini `systemInstruction` and patient/transcript data as a separate user content part. Delimit transcript data explicitly and state that instructions found inside it are clinical conversation/data, not model instructions. Have one function own placeholder expansion; accept either a template plus variables or a final prompt, never both.
- **Expected impact:** **Quality:** High. **Speed:** Neutral. **Cost:** Slight reduction from simpler construction.
- **Implementation difficulty:** Medium.

#### 8. Default model is a preview identifier and model choice is exposed without quality policy

- **Code location:** `src/components/smart-note-dialog.tsx:83-92,635-645`; `src/lib/llm.ts:597-637`
- **Why it matters:** The default is `gemini-3-flash-preview`, and another preview model is selectable. Preview identifiers can change or disappear and may produce output drift. Users can select a cheaper/lighter model for a clinical letter without any task-specific quality guard, while the same selection is applied to both note and letter.
- **Recommendation:** Establish a server-side model policy: a stable, evaluated default for letters; optional lower-cost model for internal notes only after evaluation; and an allowlist/fallback controlled in one module. Hide raw preview choices from routine UI or label them experimental. Record prompt version and model with every artifact so regressions are traceable. Re-evaluate pricing constants regularly; they are currently hard-coded.
- **Expected impact:** **Quality:** High. **Speed:** Medium depending on selected stable model. **Cost:** Medium through task-appropriate routing.
- **Implementation difficulty:** Low–Medium.

#### 9. Transcript input has no preflight normalisation or bounds

- **Code location:** `src/components/smart-note-dialog.tsx:731-741,850-853`; `src/app/actions.ts:629-663`; `src/lib/llm.ts:639-660`
- **Why it matters:** Aside from `.trim()`, pasted transcripts have no minimum/maximum length, token estimate, encoding cleanup, repeated-segment detection, or obvious wrong-input detection. Very long inputs can exceed model or function limits; very short/noisy inputs can still produce authoritative-looking letters. `maxOutputTokens: 8192` is used for every note and letter regardless of type.
- **Recommendation:** Add deterministic preprocessing: normalise line endings/Unicode, collapse excessive whitespace, remove exact repeated blocks, preserve speaker/timestamp lines, and estimate input tokens/characters. Reject empty or implausibly short transcripts; warn and require confirmation for unusually long or low-information inputs. Set output limits by document type (letters normally need far less than 8,192 tokens) and surface a clear “transcript too large” response before making the API call.
- **Expected impact:** **Quality:** Medium–High. **Speed:** Medium. **Cost:** Medium.
- **Implementation difficulty:** Low.

#### 10. Audio segments are transcribed sequentially with no boundary reconciliation

- **Code location:** `src/components/smart-note-dialog.tsx:123-228,380-433`; `src/app/api/transcribe/route.ts:20-82`
- **Why it matters:** Sequential uploads make transcription latency the sum of all segment times. Hard segmentation has no overlap, contextual prompt, speaker labelling, language setting, or seam deduplication, so words around rotations can be lost or repeated and clinical speakers can be confused. Those errors propagate directly into the letter.
- **Recommendation:** Upload a small bounded number of segments concurrently (for example two at a time) to respect free-tier/rate constraints while reducing latency. Rotate with a short audio overlap if feasible and deduplicate overlapping transcript text deterministically. Pass the known language and a small specialty vocabulary/context prompt if the transcription API supports it. Preserve segment indices and show the combined transcript for clinician correction before generation, especially after multi-segment audio.
- **Expected impact:** **Quality:** Medium–High. **Speed:** High for multi-segment recordings. **Cost:** Neutral.
- **Implementation difficulty:** Medium.

#### 11. Additional-document context duplicates the same facts multiple times

- **Code location:** `src/app/actions.ts:1216-1321,1347-1360`
- **Why it matters:** The current transcript, generated consult note, generated referrer letter, and source transcription can all describe the same consultation and are concatenated together. Past history similarly includes multiple generated artifacts per encounter and all artifact versions are fetched even though only the current version is used. Duplication inflates tokens and can cause the model to treat repeated generated claims as corroborated facts, compounding an earlier hallucination.
- **Recommendation:** Use a source hierarchy. Prefer the raw transcript as the factual source; include either the current note or letter only when no transcript exists. For history, select one current artifact per encounter (prefer clinician-edited/current letter or note), label provenance, and cap by characters/tokens rather than only encounter count. Query only current version content instead of `artifact_version(*)`.
- **Expected impact:** **Quality:** High. **Speed:** Medium. **Cost:** High for additional documents.
- **Implementation difficulty:** Medium.

#### 12. Retry/fallback behaviour is unbounded by error class and can multiply cost

- **Code location:** `src/lib/llm.ts:480-523`; `callGemini`/`callGroq`/`callOpenRouterGroq` at `src/lib/llm.ts:133-408`
- **Why it matters:** Extraction calls try up to three providers for every exception, including permanent errors such as invalid requests, missing keys, or malformed responses. There is no fetch timeout, retry-after handling, jitter, or distinction between retryable 429/5xx failures and permanent 4xx failures. This can consume most of a Vercel execution window and create redundant billed calls. Letter generation, conversely, has no controlled retry even for a transient 429.
- **Recommendation:** Add `AbortSignal.timeout` comfortably below the function deadline. Retry only network errors, 429, and selected 5xx responses, honouring `Retry-After`, with at most one bounded retry/fallback. Fail immediately on authentication, invalid-input, and missing-key errors. Apply the same central policy to prose generation. Log each attempt under one correlation ID.
- **Expected impact:** **Quality:** Medium through more predictable completion. **Speed:** High during failures. **Cost:** Medium.
- **Implementation difficulty:** Medium.

#### 13. JSON extraction silently converts malformed output to success with an empty result

- **Code location:** `src/lib/llm.ts:176-220,288-310,410-422`
- **Why it matters:** JSON parse failures return `[]`, and Gemini still logs `success: true`. The task UI can therefore report successful extraction of zero tasks when the model actually returned invalid JSON. The response is not validated against the TypeScript interfaces, and every parsed item is copied into multiple semantic properties (`issues`, `investigations`, `interventions`, `tasks`).
- **Recommendation:** Use provider-native JSON schema/structured output where available and validate with a small runtime schema. Treat parse/schema failure as failure, not an empty success. Return a generic `{items, usage, cost}` internally and map to the correct domain once. Drop invalid individual rows with warnings only when the enclosing response is otherwise valid.
- **Expected impact:** **Quality:** High for extraction reliability. **Speed:** Neutral. **Cost:** Low–Medium reduction by avoiding misleading reruns.
- **Implementation difficulty:** Medium.

#### 14. Task extraction always runs and task writes are N+1

- **Code location:** `src/app/actions.ts:735-755`; `src/components/smart-note-dialog.tsx:83-100,307-345`; `supabase_migration_tasks.sql:5-36`
- **Why it matters:** Users cannot opt out of the separate task LLM call even if they only need a letter. Each task is then inserted in its own Supabase request. This adds tokens, network round trips, and execution time, and repeat generations create duplicate suggested tasks.
- **Recommendation:** Make task extraction explicit or run it only when the task panel/workflow needs it. If it remains default, execute it concurrently and insert validated tasks in one batch. Add database-level deduplication tied to source artifact/fingerprint.
- **Expected impact:** **Quality:** Medium (fewer duplicate tasks). **Speed:** Medium–High. **Cost:** High when task extraction is unnecessary.
- **Implementation difficulty:** Low.

### P2 — Supporting application efficiency and reliability

#### 15. Artifact persistence is race-prone and uses multiple round trips

- **Code location:** `src/app/actions.ts:510-573`; performance indexes in `supabase_migration_performance_indexes.sql:4-14`
- **Why it matters:** `ensureEncounter` performs select-then-insert and `saveArtifact` performs select, insert/update, then another insert/update without a transaction. Concurrent submissions can create duplicate encounters/artifacts or duplicate version numbers. Error results from several inserts/updates are ignored. The existing indexes help reads but do not enforce uniqueness.
- **Recommendation:** Add unique constraints on encounter `(canonical_patient_id, encounter_date)`, artifact `(encounter_id, artifact_type)`, and artifact version `(artifact_id, version_number)`. Use an atomic Supabase RPC/Postgres function or conflict-aware upsert to allocate and save a version in one transaction. Check every database error. This is a small database-side simplification, not new infrastructure.
- **Expected impact:** **Quality:** Medium through correct version provenance. **Speed:** Medium. **Cost:** Low bandwidth/request reduction.
- **Implementation difficulty:** Medium.

#### 16. Queries fetch all columns and all artifact versions unnecessarily

- **Code location:** `src/lib/data.ts:63-113`; `src/app/actions.ts:1186-1230,1284-1294`; cost stats at `src/app/actions.ts:770-793`
- **Why it matters:** Patient timelines and additional-document generation use `select('*')` and `artifact_version(*)`, transferring every historical version and potentially large transcript/letter bodies. This consumes Supabase Free database egress, increases server memory and response time, and makes cold requests heavier. Cost stats fetch every matching log row just to sum it in JavaScript.
- **Recommendation:** Select only displayed columns. Fetch current artifact content via a view/RPC or a targeted second query keyed by `(artifact_id, current_version)`. Paginate old encounters/versions. Aggregate LLM cost/count in SQL rather than transferring all rows. Retain existing useful composite indexes and add constraints before adding more indexes, since indexes also consume free-tier storage.
- **Expected impact:** **Quality:** Neutral. **Speed:** Medium–High as history grows. **Cost:** Medium reduction in bandwidth/storage pressure.
- **Implementation difficulty:** Medium.

#### 17. LLM logging is fire-and-forget in a serverless function

- **Code location:** `src/lib/llm.ts:77-95` and all `void logLLMCall(...)` call sites
- **Why it matters:** Vercel may freeze/terminate the invocation after the response path completes, so unawaited logging can be lost. Missing logs distort model cost, error-rate, and latency evidence needed to optimise the pipeline. Each LLM attempt also creates a separate database write.
- **Recommendation:** Await logging on the successful/failed call path, but do it concurrently with artifact persistence where possible and keep failures non-fatal. Alternatively collect attempt records during the action and batch-insert once before returning. Add a correlation/input fingerprint and prompt version, but do not store transcript or PHI in logs.
- **Expected impact:** **Quality:** Medium indirectly through trustworthy evaluation. **Speed:** Negligible if batched/concurrent. **Cost:** Low request reduction.
- **Implementation difficulty:** Low.

#### 18. Authentication is presence-only while server actions use the service-role client

- **Code location:** `src/lib/auth.ts:4-15`; `src/middleware.ts:6-31`; `src/lib/supabase.ts:2-17`; `src/app/actions.ts:1-5`
- **Why it matters:** Any value for the long-lived cookie is treated as authenticated, and server actions shown in this review do not independently verify authentication before using a Supabase service-role client that bypasses RLS. Although primarily a security issue, unauthorised generation could consume LLM quotas and Supabase resources on the free tiers. A 30-day presence-only cookie also makes revocation and audit difficult.
- **Recommendation:** Sign and verify the cookie (HMAC with expiry) and call a shared authorization guard at the start of every mutating server action/API route. Keep the service-role key server-only, as it currently is, and narrow each action's accepted fields. This does not require adopting paid Supabase Auth or new infrastructure.
- **Expected impact:** **Quality:** Neutral. **Speed:** Negligible overhead. **Cost:** Medium protection against quota abuse.
- **Implementation difficulty:** Low–Medium.

#### 19. There is no repeatable clinical quality evaluation harness

- **Code location:** Prompt files under `src/lib/prompts/`; manual tools at `scripts/prompt_tuner.py` and `scripts/prompt_tuner_web.py`; no test files/scripts in `package.json`
- **Why it matters:** Prompt changes are tuned interactively against individual transcripts, with no regression set or scored criteria. It is impossible to know whether shorter prompts or a different model improve hallucination rate, fact recall, GP-action accuracy, formatting, latency, and token cost across consult types.
- **Recommendation:** Create a local, de-identified fixture set covering new/review, IBD, functional, oesophageal/EoE, short/noisy transcripts, ambiguous medication doses, negation, and conflicting speaker statements. Store clinician-approved facts and letter requirements, not necessarily one exact prose answer. Run prompts manually or in a deliberately invoked script (not CI, to avoid surprise API cost), cache raw model responses by prompt/model/input hash, and report fact precision/recall, unsupported-claim count, action accuracy, latency, and tokens. Start with 10–20 cases.
- **Expected impact:** **Quality:** Very High over time. **Speed:** Neutral in production. **Cost:** Medium long-term savings; small controlled evaluation spend.
- **Implementation difficulty:** Medium.

## Prompt-specific observations

- The general new-letter prompt says section headers may be bold and permits plan bullets, while the appended natural-style directive says the plan must never use bullets. The last instruction may win, but relying on ordering is brittle.
- Review prompts alternate between first-person dictated voice and “formal third-person medical prose.” This changes tone and can confuse who owns a clinical decision.
- Required boilerplate such as “No action required by you” can become an unsupported clinical assertion. It should be generated only after explicit action extraction from the transcript; when unclear, the letter should be flagged for review rather than forced into one of two statements.
- The new-letter examination instruction can generate “I did not perform a physical examination” based on absence of evidence. Omission is safer unless consultation modality or the clinician explicitly supports that statement.
- Disease-specific review coverage is incomplete: oesophageal and EoE review selections are silently routed to the functional review prompt (`src/app/actions.ts:701-706`). Until dedicated prompts exist, the general review prompt is less misleading than a functional-disorder-specific role.
- Pronoun directives are appended, which is helpful, but auto mode invites inference from name/transcript. If pronouns are not explicit, neutral phrasing using the patient's name is safer than guessing.

## Recommended delivery sequence

### First pass (low effort, immediate return)

1. Correct the complexity directive and remove the weakest/longest examples.
2. Add transcript preflight and deterministic output validation, including finish-reason handling.
3. Lower document-specific output token limits.
4. Run note, letter, and tasks concurrently; batch task inserts.
5. Route EoE/oesophageal review to the general review prompt instead of the functional prompt.

### Second pass (reliability and free-tier efficiency)

1. Add generation fingerprints/idempotency and database uniqueness constraints.
2. Separate system instructions from transcript data.
3. Query only current artifact versions and remove duplicated context.
4. Centralise timeout/retry/model policy and batch reliable LLM logs.
5. Sign authentication cookies and guard server actions.

### Third pass (measured quality improvement)

1. Build the de-identified regression set and factual scoring harness.
2. Compare the stable candidate models and compact prompt variants on the same cases.
3. Choose the default by clinical fact precision/recall and GP-action accuracy first, then latency and cost.
4. Keep prompt/model versions with every saved artifact so future regressions are explainable.

## Free-tier fit

All primary recommendations use the existing Next.js/Vercel, Supabase, Gemini, and Groq stack. They reduce function wall time, database round trips, egress, stored duplicate versions, and LLM tokens. No queue, worker service, paid cache, vector database, or additional hosted component is necessary. The only database changes proposed are constraints, compact metadata, targeted queries, and optionally a small transactional RPC—well aligned with Supabase Free and simpler than coordinating multiple client-side writes.
