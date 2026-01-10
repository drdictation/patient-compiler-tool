# Patient Compiler Tool

A clinician memory EMR that reads from Dr Dictation via Bridge API and maintains a longitudinal patient memory overlay.

## 🚀 Setup Instructions

### 1. Configure Logic
1. Copy `.env.example` to `.env.local`
2. Set a strong password in `APP_PASSWORD`
3. Generate a random string for `BRIDGE_API_KEY` (e.g. `openssl rand -hex 32`)

### 2. Setup Supabase (Overlay Database)
1. Create a project at [supabase.com](https://supabase.com)
2. Go to SQL Editor and run the script from [`supabase_schema.md`](file:///Users/cbasnayake/.gemini/antigravity/brain/e1c38891-d807-4c53-bdc2-c9172a3c0692/supabase_schema.md)
3. Get URL/Key from Settings -> API and put in `.env.local`

### 3. Setup Dr Dictation Bridge (Data Source)
1. In your Dr Dictation codebase, implement `transcriber/views/bridge.py` based on [`bridge_api_specification.md`](file:///Users/cbasnayake/.gemini/antigravity/brain/e1c38891-d807-4c53-bdc2-c9172a3c0692/bridge_api_specification.md)
2. Deploy to Heroku
3. Set `BRIDGE_API_KEY` in Heroku Config Vars to match `.env.local`

### 4. Run Locally
```bash
npm install
npm run dev
```

### 5. Sync
- Log in with your password
- Click "Sync Now" on the dashboard
- It will pull records from Heroku and populate the list
