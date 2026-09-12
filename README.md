# Patient Compiler Tool

> **A clinician memory EMR and longitudinal clinical overlay built for gastroenterology practices.**
> Reads consultation records from Dr Dictation via the Bridge API, maintains an auditable patient memory overlay in Supabase, generates high-accuracy specialist correspondence and internal notes, and tracks symptoms, interventions, investigations, and tasks over time.

---

## 🏗 System Architecture & Topology

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   INBOUND SOURCES                                      │
├────────────────────────────────┬───────────────────────────────┬──────────────────────┤
│ Dr Dictation (Heroku)          │ Browser / Mobile UI           │ Gmail Ingestion      │
│ - Watermarked batch sync       │ - Direct consult notes        │ - iOS voice shortcut │
│ - Dictation audio/text         │ - Groq Whisper audio capture  │ - Email forwards     │
│ - Consult dates & patient IDs  │ - Manual curation & edits     │ - AI patient match   │
└───────────────┬────────────────┴───────────────┬───────────────┴──────────┬───────────┘
                │                                │                          │
                ▼                                ▼                          ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              NEXT.JS 14+ APPLICATION CORE                              │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  Route Handlers & Server Actions (src/app/actions.ts, src/app/api/)                    │
│                                                                                        │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐  │
│  │ Generation & Safety Engine (src/lib/generation/, src/lib/prompts/)               │  │
│  │ - Transcript Normalisation: Unicode NFC, bounds (50-250k chars), SHA-256 hash   │  │
│  │ - Prompt Registry: Strict sub-specialty routing (General, IBD, Functional, etc.) │  │
│  │ - Decoupled Execution: Concurrent note/letter generation (Promise.allSettled)    │  │
│  │ - Detached Task Extraction: Non-blocking batch ingestion via Groq Llama 4        │  │
│  │ - Deterministic Letter Validation: 10 fatal rules (blocks save) + 6 warnings     │  │
│  │ - Bounded Request Budgets: fetchWithRetryAndTimeout, retryable error handling    │  │
│  └──────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                        │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐  │
│  │ AI Multi-Model Routing (src/lib/model-config.ts, src/lib/llm.ts)                 │  │
│  │ - Referrer Letters: gpt-5.6-luna (OpenAI Responses API)                          │  │
│  │ - Consult Notes: gemini-3.1-flash-lite (Google GenAI)                            │  │
│  │ - Endoscopy / Clinical Briefs: gemini-2.5-flash                                  │  │
│  │ - Email Matching: gemini-3.1-flash-lite                                          │  │
│  │ - Task Extraction: Groq Llama 4 Scout / GPT OSS 120B                             │  │
│  │ - Audio Transcription: Groq Whisper Large v3                                     │  │
│  └──────────────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────┬─────────────────────────────────────────────┘
                                           │
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              SUPABASE POSTGRESQL OVERLAY                               │
├───────────────────────────────┬───────────────────────────────┬────────────────────────┤
│ Patient & Encounters          │ Longitudinal State            │ Operational / Ingestion│
│ - canonical_patient           │ - patient_issue               │ - inbox_item           │
│ - encounter                   │ - patient_issue_source        │ - llm_calls            │
│ - artifact (v1..vn)           │ - patient_investigation       │ - sync_watermark       │
│ - artifact_version            │ - patient_intervention        │ - source_record_cache  │
│                               │ - patient_task                │                        │
└───────────────────────────────┴───────────────────────────────┴────────────────────────┘
```

---

## 🌟 Core Feature Modules

### 1. Longitudinal Clinical Memory (Panels)
- **Issues Panel** (`patient_issue`): Tracks clinical problems and symptoms longitudinally (Active, Monitoring, Resolved) with exact transcript evidence quotes and source encounter linkages (`patient_issue_source`).
- **Investigations Dashboard** (`patient_investigation`): Logs diagnostic tests across Endoscopy, Imaging, Pathology, and Manometry. Crucially records **recall / surveillance next due dates** (e.g. 5-yearly colonoscopy for polyp surveillance).
- **Interventions Timeline** (`patient_intervention`): Captures medications, diets (e.g. Low FODMAP), supplements, and procedures with clinical response ratings (`Effective`, `Partial`, `Ineffective`, `Ongoing`).
- **Task Management** (`patient_task`): Tracks clinical, administrative, and follow-up tasks with confidence ratings, snooze capability (7/14/30 days), and cross-patient overview.

### 2. Smart Notes Engine v2
- **Audio Recording or Paste**: Browser-based recording via `MediaRecorder` transcribed via Groq Whisper (`whisper-large-v3`).
- **Decoupled Asynchronous Lifecycle**:
  - `prepareSmartNoteGeneration()`: Normalises transcript, checks 50-250k bounds, computes SHA-256 hash, saves raw transcript once, and builds authoritative context.
  - `generateClinicalDocuments()`: Runs internal consult note (`gemini-3.1-flash-lite`) and specialist referrer letter (`gpt-5.6-luna`) concurrently via `Promise.allSettled`.
  - `extractAndSaveTasks()`: Extracts tasks via Groq Llama 4 and batch-inserts in a single query asynchronously without delaying letter presentation.
- **Sub-specialty Prompts**: General, IBD, Functional GI, Oesophageal, and EoE prompts routed strictly via `src/lib/prompts/registry.ts`.
- **`DETAILED_LETTER_DIRECTIVE`**: High-completeness mode grounded strictly in transcript facts (forbids ungrounded pathophysiology or medicolegal speculation).
- **Deterministic Letter Validation**: 10 fatal validation checks (unresolved placeholders, scaffold markers, code fences, missing Summary or Impression/Plan, few-shot example name leakage, contradictory GP actions) prevent unsafe persistence. 6 clinician warnings alert on subtle discrepancies.

### 3. Endoscopy List & Pre-Visit Briefings
- **Pre-Visit Brief**: Instant on-demand synthesis of active issues, ongoing medications, and pending investigations prior to outpatient visits.
- **Endoscopy List Briefing** (`/api/endoscopy-briefing`): Multi-patient batch generator producing high-contrast, printable 15-second procedural briefing cards (indications, risk factors, specific biopsy protocols).

### 4. Gmail Inbox Integration
- Ingests emails or iOS voice memos sent via Gmail.
- AI patient matching using `gemini-3.1-flash-lite` calculates match confidence (0-100%).
- Clinician can assign inbox items directly to patient records, letters, or tasks.

### 5. Telemetry & Cost Tracking
- Every LLM interaction is instrumented via `logLLMCall` into the `llm_calls` table with input/output token counts, latency, USD micro-costs, provider, and model metadata.

---

## 📁 Repository Structure

```text
.
├── src/
│   ├── app/
│   │   ├── actions.ts              # Primary server actions (Smart Notes, CRUD, Inbox, Tasks)
│   │   ├── layout.tsx              # Root layout & theme providers
│   │   ├── page.tsx                # Main patient dashboard
│   │   ├── api/
│   │   │   ├── clinical-brief/     # 1-sentence OCR clinical summary endpoint
│   │   │   ├── endoscopy-briefing/ # Batch endoscopy list briefing generator
│   │   │   ├── sync/               # Heroku Bridge sync endpoint
│   │   │   ├── transcribe/         # Audio transcription route
│   │   │   ├── patient/[id]/       # Patient-specific extraction endpoints
│   │   │   └── search/             # Global patient search API
│   │   ├── inbox/                  # Gmail inbox management page
│   │   ├── patient/[id]/           # Patient detailed timeline and clinical panels
│   │   └── search/                 # Patient search page
│   ├── components/
│   │   ├── smart-note-dialog.tsx   # Smart note modal (audio record, paste, concurrent generation)
│   │   ├── create-document-dialog.tsx # Additional documents (Outbound referral, Patient summary)
│   │   ├── endoscopy-list-dialog.tsx  # Multi-patient endoscopy briefing sheet generator
│   │   ├── pre-visit-brief.tsx     # Pre-consultation summary modal
│   │   ├── issues-panel.tsx        # Longitudinal symptoms/issues curation
│   │   ├── investigations-panel.tsx# Test and surveillance tracker
│   │   ├── interventions-panel.tsx # Treatment and response timeline
│   │   ├── tasks-panel.tsx         # Patient-level task list
│   │   ├── tasks-sidebar.tsx       # Global pending tasks drawer with snooze
│   │   ├── inbox-list.tsx          # Gmail inbox item list
│   │   ├── inbox-item-card.tsx     # Inbox item review card
│   │   ├── assign-inbox-dialog.tsx # Assign inbox item to patient/record
│   │   ├── llm-cost-display.tsx    # Live telemetry and cost aggregation card
│   │   └── ui/                     # shadcn/ui components
│   └── lib/
│       ├── generation/             # Smart Note generation engine & test suite
│       │   ├── contracts.ts        # Typed contexts, statuses, and error codes
│       │   ├── transcript.ts       # Unicode NFC normalisation, bounds, SHA-256 hash
│       │   ├── letter-validation.ts# 10 fatal validation rules & 6 clinician warnings
│       │   └── *.test.ts           # 77 unit & integration tests
│       ├── prompts/                # Clinical prompt repository
│       │   ├── registry.ts         # Explicit (template, type) routing & detailed directive
│       │   ├── types.ts            # GenerationRequest interface with prompt/data separation
│       │   └── *.ts                # Sub-specialty prompt templates
│       ├── auth.ts                 # Single-user cookie-based authentication
│       ├── bridge.ts               # Dr Dictation Heroku Bridge client
│       ├── data.ts                 # Supabase query helpers (batched joins, no N+1)
│       ├── gmail-inbox.ts          # Gmail OAuth2 client & AI patient matching
│       ├── llm.ts                  # Provider integrations (Gemini, OpenAI, Groq)
│       ├── llm-request.ts          # Bounded request budgets & retry logic
│       ├── model-config.ts         # Centralized model registry
│       ├── supabase.ts             # Supabase client instances
│       └── sync.ts                 # Heroku -> Supabase incremental sync engine
├── supabase_migration_*.sql        # Database schema migrations
├── scripts/                        # Prompt tuning and evaluation scripts
├── APP_IMPLEMENTATION_SPEC.md      # Detailed generation refactor blueprint
├── APP_REVIEW.md                   # Architectural review & recommendations tracker
├── SMART_NOTE_SPEC.md              # Smart note technical specification
├── IMPLEMENTATION_PROGRESS.md      # Commit-by-commit refactoring progress
└── GMAIL_INBOX_SETUP.md            # Gmail OAuth setup guide
```

---

## 🤖 Active AI Models

Configured centrally in `src/lib/model-config.ts` and `src/lib/llm.ts`:

| Purpose | Model | Provider / Endpoint |
|:---|:---|:---|
| **Referrer Letters** | `gpt-5.6-luna` | OpenAI (`/v1/responses`) |
| **Consult Notes** | `gemini-3.1-flash-lite` | Google Generative Language API |
| **Endoscopy & Clinical Briefs**| `gemini-2.5-flash` | Google Generative Language API |
| **Email Patient Matcher** | `gemini-3.1-flash-lite` | Google Generative Language API |
| **Task Extraction** | `llama-4-scout-17b` or `gpt-oss-120b` | Groq API (`/openai/v1/chat/completions`) |
| **Voice Transcription** | `whisper-large-v3` | Groq Audio API |

---

## 🚀 Setup & Installation

### 1. Environment Configuration
Create `.env.local` in the project root:

```env
# Application Password
APP_PASSWORD=your-secure-password

# Supabase (Overlay Database)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Dr Dictation Bridge (Data Source)
BRIDGE_API_URL=https://your-drdictation-app.herokuapp.com
BRIDGE_API_KEY=your-bridge-api-key

# AI Providers
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=AIza...
GROQ_API_KEY=gsk_...

# Optional: Gmail Inbox Integration
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
GMAIL_REFRESH_TOKEN=...
```

### 2. Supabase Database Migrations
Execute the SQL migrations in the Supabase SQL Editor in the following sequence:
1. `supabase_migration_issues.sql` (Issues & evidence quotes)
2. `supabase_migration_investigations.sql` (Investigations & recall dates)
3. `supabase_migration_interventions.sql` (Interventions & response ratings)
4. `supabase_migration_tasks.sql` (Patient tasks & snooze states)
5. `supabase_migration_patient_fields.sql` (Administrative & Medicare fields)
6. `supabase_migration_llm_calls.sql` (Telemetry & cost tracking)
7. `supabase_migration_incremental.sql` (Incremental extraction tracking)
8. `supabase_migration_performance_indexes.sql` (High-performance composite indexes)
9. `supabase_migration_artifact_types.sql` (Outbound referral & patient summary types)
10. `supabase_migration_inbox.sql` (Gmail inbox items table)

### 3. Local Development
```bash
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) and sign in using `APP_PASSWORD`.

---

## 🧪 Testing & Verification

The generation engine has comprehensive test coverage verifying contracts, concurrency, validation rules, prompt injection defenses, retry budgets, and routing:

```bash
node --import tsx --env-file=.env --test src/lib/generation/*.test.ts
```

**Test Suite Coverage:**
- `actions.test.ts`: Smart Note preparation, encounter reuse, raw transcript persistence.
- `concurrency.test.ts`: Parallel note/letter execution (`Promise.allSettled`), single-query batch task insertion.
- `llm-request.test.ts`: Error classification (`RETRYABLE` vs `NON_RETRYABLE`), request timeouts, and backoff.
- `letter-validation.test.ts`: 10 fatal rules (placeholders, scaffolding, code fences, headers) and 6 warning rules.
- `prompt-injection.test.ts`: Boundary isolation, security policy adherence, metadata handling.
- `routing.test.ts`: Exhaustive coverage of all 10 valid `(templateType, letterType)` routing pairs and directive validation.

---

## 🔒 Security & Data Integrity

- **Source Invariance**: Raw transcripts (`source_record_cache`, `artifact.RAW_TRANSCRIPT`) are immutable once persisted.
- **Clinician in the Loop**: AI suggestions across Issues, Investigations, Interventions, and Tasks enter as `suggested` and require clinician curation (`accepted`, `rejected`, or `clinician_entered`).
- **Prompt Injection Defense**: Transcripts are passed within strict delimiters (`=== BEGIN CLINICAL TRANSCRIPT SOURCE ===`), backed by system security instructions forbidding prompt overrides.
- **Fail-Safe Generation**: Letters failing fatal deterministic validation rules are never silently saved to the database.
