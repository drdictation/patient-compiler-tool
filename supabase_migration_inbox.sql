-- Inbox Item Table
-- Stores emails and other content forwarded to the Patient Compiler inbox
-- for assignment to patients as records, letters, or tasks

CREATE TABLE inbox_item (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    
    -- Source info
    source TEXT NOT NULL CHECK (source IN ('email', 'manual')),
    gmail_message_id TEXT UNIQUE,  -- For deduplication
    sender_email TEXT,
    sender_name TEXT,
    subject TEXT,
    
    -- Content
    raw_content TEXT NOT NULL,
    html_content TEXT,
    has_attachments BOOLEAN DEFAULT FALSE,
    attachment_count INTEGER DEFAULT 0,
    
    -- AI suggestions
    ai_suggested_patient_id UUID REFERENCES canonical_patient(id),
    ai_suggested_patient_name TEXT,
    ai_confidence DECIMAL(3,2),  -- 0.00 to 1.00
    
    -- Assignment
    assigned_patient_id UUID REFERENCES canonical_patient(id),
    assigned_as TEXT CHECK (assigned_as IN ('record', 'letter', 'task', 'smart_note')),
    assigned_artifact_id UUID,  -- Reference to created artifact/task
    
    -- Lifecycle
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'discarded')),
    received_at TIMESTAMPTZ NOT NULL,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for pending items query
CREATE INDEX idx_inbox_item_status ON inbox_item(status) WHERE status = 'pending';
CREATE INDEX idx_inbox_item_gmail_id ON inbox_item(gmail_message_id);

-- Enable Row Level Security (optional, for future multi-user support)
ALTER TABLE inbox_item ENABLE ROW LEVEL SECURITY;

-- Allow all operations for now (since this is single-user)
CREATE POLICY "Allow all operations on inbox_item" ON inbox_item
    FOR ALL USING (true);
