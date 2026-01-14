# Patient Compiler Tool

A clinician memory EMR that reads from Dr Dictation via Bridge API and maintains a longitudinal patient memory overlay. Built for gastroenterology practices.

## ✨ Features

### Patient Management
- **Patient Dashboard** – List all patients with search, filter by active/monitoring/all
- **Patient Profiles** – View patient details with administrative info (DOB, Medicare, IHI, etc.)
- **Bulk Actions** – Select multiple patients for merge or delete operations

### Clinical Data Extraction (AI-Powered)
- **Issues Panel** – AI extracts symptoms/problems, clinician curates (accept/reject/edit)
- **Investigations Panel** – Track tests, procedures, imaging with recall dates
- **Interventions Panel** – Log treatments with response tracking (Effective/Partial/Ineffective)
- **Global Scan** – Process all records at once with model selection

### Smart Notes
- **Smart Note Dialog** – Paste transcript or record audio directly
- **Audio Recording** – Browser-based recording with Groq Whisper transcription
- **Auto-Generation** – Generate internal notes and/or referrer letters
- **Task Extraction** – AI extracts clinical/administrative/follow-up tasks

### Pre-Visit Brief
- **On-demand summary** before appointments
- Shows active issues, recent investigations, ongoing interventions
- Printable format

### Tasks Management
- **Tasks Sidebar** – View all pending tasks across patients
- **Task Actions** – Complete, snooze (7/14/30 days), or delete tasks
- **Patient-specific Tasks** – View and manage tasks per patient

### LLM Cost Tracking
- Logs all LLM calls with token usage and cost
- Supports Gemini (2.5 Flash, 2.5 Flash-Lite, 3.0 Flash) and Groq (Llama 4 Maverick, GPT OSS)

---

## 🚀 Setup Instructions

### 1. Configure Environment
1. Copy `.env.example` to `.env.local`
2. Set a strong password in `APP_PASSWORD`
3. Generate a random string for `BRIDGE_API_KEY` (e.g. `openssl rand -hex 32`)
4. Add your Gemini API key: `GEMINI_API_KEY`
5. Add your Groq API key: `GROQ_API_KEY`

### 2. Setup Supabase (Overlay Database)
1. Create a project at [supabase.com](https://supabase.com)
2. Run the migration scripts in order:
   - `supabase_migration_issues.sql`
   - `supabase_migration_investigations.sql`
   - `supabase_migration_interventions.sql`
   - `supabase_migration_tasks.sql`
   - `supabase_migration_patient_fields.sql`
   - `supabase_migration_llm_calls.sql`
   - `supabase_migration_incremental.sql`
3. Get URL/Key from Settings -> API and put in `.env.local`

### 3. Setup Dr Dictation Bridge (Data Source)
1. In your Dr Dictation codebase, implement the Bridge API endpoint
2. Deploy to Heroku
3. Set `BRIDGE_API_KEY` in Heroku Config Vars to match `.env.local`
4. Set `BRIDGE_BASE_URL` to your Heroku app URL

### 4. Run Locally
```bash
npm install
npm run dev
```

### 5. Sync
- Log in with your password
- Click "Sync Now" on the dashboard
- It will pull records from Heroku and populate the list

---

## 🛠 Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **Database**: Supabase (PostgreSQL)
- **UI**: shadcn/ui + Tailwind CSS 4
- **LLM**: Gemini API, Groq API
- **Audio**: Groq Whisper API (whisper-large-v3)
- **Toasts**: Sonner

---

## 📁 Project Structure

```
src/
├── app/
│   ├── actions.ts         # Server actions (CRUD, LLM calls)
│   ├── api/               # API routes (sync, patient, search, transcribe)
│   ├── login/             # Login page
│   ├── patient/[id]/      # Patient detail page
│   ├── search/            # Search page
│   └── page.tsx           # Dashboard
├── components/
│   ├── issues-panel.tsx        # Issues management
│   ├── investigations-panel.tsx # Investigations tracking
│   ├── interventions-panel.tsx  # Interventions tracking
│   ├── tasks-panel.tsx         # Tasks per patient
│   ├── tasks-sidebar.tsx       # Global tasks sidebar
│   ├── pre-visit-brief.tsx     # Pre-visit summary
│   ├── smart-note-dialog.tsx   # Smart note creation
│   ├── patient-list.tsx        # Dashboard patient list
│   └── ui/                     # shadcn/ui components
└── lib/
    ├── llm.ts             # LLM integration (Gemini, Groq)
    ├── prompts.ts         # Smart note prompts
    ├── data.ts            # Data fetching utilities
    ├── sync.ts            # Bridge sync logic
    └── supabase.ts        # Supabase client
```
