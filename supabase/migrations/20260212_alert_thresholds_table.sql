-- Configurable auto-alert thresholds
-- Edit these in Supabase Table Editor to change when reminders fire
CREATE TABLE IF NOT EXISTS alert_thresholds (
  id SERIAL PRIMARY KEY,
  level INT NOT NULL UNIQUE,          -- 1, 2, 3
  percent INT NOT NULL,               -- e.g. 10, 30, 100
  label TEXT NOT NULL,                 -- e.g. 'Early Reminder'
  emoji TEXT NOT NULL DEFAULT '📋',
  color TEXT NOT NULL DEFAULT '#2563eb',
  tone TEXT NOT NULL,                  -- opening line in the email
  notify_roles TEXT[] NOT NULL,        -- which roles get notified at this level
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed default thresholds
INSERT INTO alert_thresholds (level, percent, label, emoji, color, tone, notify_roles) VALUES
  (1, 10, 'Early Reminder',     '📋', '#2563eb', 'We wanted to give you an early heads-up',                        ARRAY['WORKSTREAM_LEAD']),
  (2, 30, 'Important Reminder', '📌', '#ea580c', 'This is an important reminder that time is moving along',        ARRAY['WORKSTREAM_LEAD', 'PROGRAM_OWNER']),
  (3, 100, 'Final Reminder',    '⏳', '#dc2626', 'This is a final reminder — the deadline has arrived',            ARRAY['WORKSTREAM_LEAD', 'PROGRAM_OWNER', 'PLATFORM_ADMIN'])
ON CONFLICT (level) DO NOTHING;

-- Allow service role full access, authenticated users read-only
ALTER TABLE alert_thresholds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON alert_thresholds
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read thresholds" ON alert_thresholds
  FOR SELECT TO authenticated USING (true);
