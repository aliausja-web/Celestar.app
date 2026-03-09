CREATE TABLE IF NOT EXISTS cron_runs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  job_name text NOT NULL,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  status text CHECK (status IN (
    'running', 'success', 'failed'
  )),
  records_processed integer DEFAULT 0,
  error_message text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE cron_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admin can view cron runs"
ON cron_runs FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role = 'PLATFORM_ADMIN'
  )
);
