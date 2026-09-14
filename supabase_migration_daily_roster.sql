-- Migration: Daily Roster for Today's List Cross-Device Sync
-- Storing today's patient list across devices (MacBook, Virtual Server, Mobile).
-- Total storage footprint is tiny: ~500 bytes per day (< 200 KB per year).

CREATE TABLE IF NOT EXISTS daily_roster (
    roster_date DATE PRIMARY KEY,
    patient_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE daily_roster ENABLE ROW LEVEL SECURITY;

-- Allow all operations for single-user practice deployment
CREATE POLICY "Allow all operations on daily_roster" ON daily_roster
    FOR ALL USING (true);
