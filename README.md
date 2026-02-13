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
- **Letter Templates** – General, IBD, Functional GI, Oesophageal, EoE

### Pre-Visit Brief
- **On-demand summary** before appointments
- Shows active issues, recent investigations, ongoing interventions
- Printable format

### Tasks Management
- **Tasks Sidebar** – View all pending tasks across patients
- **Task Actions** – Complete, snooze (7/14/30 days), or delete tasks
- **Patient-specific Tasks** – View and manage tasks per patient

### Inbox (Gmail Integration)
- **Email Ingestion** – Forward emails or send voice notes via iOS Shortcut
- **AI Patient Matching** – Automatically suggests which patient an email relates to
- **Flexible Assignment** – Assign items as records, letters, tasks, or Smart Note transcripts
- **On-the-go Capture** – Dictate thoughts via iOS Shortcut → email → inbox

### LLM Cost Tracking
- Logs all LLM calls with token usage and cost
- Supports Gemini (2.5 Flash, 2.5 Flash-Lite, 3.0 Flash) and Groq (Llama 4 Maverick, GPT OSS)


---

## 🚀 Setup Instructions

### 1. Configure Environment
Create `.env.local` and set the required variables:

```env
# Auth
APP_PASSWORD=your-strong-password

# Supabase
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...

# Dr Dictation Bridge
BRIDGE_API_URL=https://your-bridge-app.herokuapp.com
BRIDGE_API_KEY=your-bridge-api-key

# LLMs
GEMINI_API_KEY=...
GROQ_API_KEY=...

# Optional: Gmail Inbox
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
GMAIL_REFRESH_TOKEN=...
```

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
   - `supabase_migration_inbox.sql` (for Gmail inbox feature)
3. Get URL/Key from Settings -> API and put in `.env.local`

### 3. Setup Gmail Inbox (Optional)
1. Follow the detailed guide in `GMAIL_INBOX_SETUP.md`
2. Create Google Cloud OAuth credentials
3. Get refresh token via OAuth Playground
4. Add `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, and `GMAIL_REFRESH_TOKEN` to `.env.local`

### 4. Setup Dr Dictation Bridge (Data Source)
1. In your Dr Dictation codebase, implement the Bridge API endpoint
2. Deploy to Heroku
3. Set `BRIDGE_API_KEY` in Heroku Config Vars to match `.env.local`
4. Set `BRIDGE_API_URL` to your Heroku app URL

### 5. Run Locally
```bash
npm install
npm run dev
```

### 6. Sync
- Log in with your password
- Click "Sync Now" on the dashboard
- It will pull records from Heroku and populate the list

---

## 🛠 Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **Database**: Supabase (PostgreSQL)
- **UI**: shadcn/ui + Tailwind CSS 4
- **LLM**: Gemini API (notes/letters), Groq API (tasks + transcription)
- **Audio**: Groq Whisper API (whisper-large-v3)
- **Toasts**: Sonner

---

## 📁 Project Structure

```
src/
├── app/
│   ├── actions.ts         # Server actions (CRUD, LLM calls)
│   ├── api/               # API routes (sync, patient, search)
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
│   ├── smart-note-dialog.tsx   # Smart note creation + audio transcription
│   ├── llm-cost-display.tsx    # LLM usage cost card
│   ├── inbox-list.tsx          # Inbox list
│   ├── inbox-item-card.tsx     # Inbox item UI
│   ├── assign-inbox-dialog.tsx # Assign inbox item
│   ├── poll-inbox-button.tsx   # Gmail poll button
│   ├── patient-list.tsx        # Dashboard patient list
│   └── ui/                     # shadcn/ui components
└── lib/
    ├── llm.ts             # LLM integration (Gemini, Groq)
    ├── prompts.ts         # Smart note prompts
    ├── data.ts            # Data fetching utilities
    ├── sync.ts            # Bridge sync logic
    └── supabase.ts        # Supabase client
```
