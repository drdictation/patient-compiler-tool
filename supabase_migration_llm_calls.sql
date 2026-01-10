-- Create llm_calls table
CREATE TABLE IF NOT EXISTS llm_calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    provider TEXT NOT NULL, -- 'gemini', 'groq'
    model TEXT NOT NULL, -- 'gemini-2.5-flash', 'gemini-3.0-flash', etc.
    purpose TEXT NOT NULL, -- 'issue_extraction', 'smart_note', etc.
    patient_id UUID REFERENCES canonical_patient(id) ON DELETE SET NULL,
    tokens_in INTEGER DEFAULT 0,
    tokens_out INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    cost_usd NUMERIC(10, 6) DEFAULT 0, -- 6 decimal places for micro-costs
    latency_ms INTEGER DEFAULT 0,
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT
);

-- Index for analytics queries
CREATE INDEX IF NOT EXISTS idx_llm_calls_created_at ON llm_calls(created_at);
CREATE INDEX IF NOT EXISTS idx_llm_calls_provider ON llm_calls(provider);
CREATE INDEX IF NOT EXISTS idx_llm_calls_purpose ON llm_calls(purpose);
