-- ============================================================================
-- Email Automation: Periodic Email Sender via pg_cron
-- Migration: 20260112_setup_email_cron_job.sql
-- Date: 2026-01-12
--
-- PURPOSE: Set up automated cron job to send pending email notifications
-- SCHEDULE: Every 10 minutes
-- FUNCTION: Invokes send-escalation-emails Edge Function
-- ============================================================================

-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant permissions to postgres role to manage cron jobs
GRANT USAGE ON SCHEMA cron TO postgres;

-- Schedule the email sending job to run every 10 minutes
-- This will invoke the Edge Function that processes pending notifications
SELECT cron.schedule(
  'send-escalation-emails-job',           -- Job name
  '*/10 * * * *',                         -- Cron expression: every 10 minutes
  $$
  SELECT
    net.http_post(
      url := 'https://YOUR_SUPABASE_PROJECT_REF.supabase.co/functions/v1/send-escalation-emails',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);

-- Query to check scheduled jobs
-- Run this to verify the cron job is set up:
-- SELECT * FROM cron.job;

COMMENT ON EXTENSION pg_cron IS 'Automated email sending every 10 minutes via send-escalation-emails Edge Function';
