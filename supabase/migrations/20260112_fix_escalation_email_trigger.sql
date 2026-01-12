-- ============================================================================
-- FIX: Escalation Email Trigger - Corrected Column Names
-- Migration: 20260112_fix_escalation_email_trigger.sql
-- Date: 2026-01-12
--
-- PURPOSE: Fix trigger to use correct column names (level not escalation_level)
-- ============================================================================

-- Drop existing trigger and function if they exist
DROP TRIGGER IF EXISTS trigger_create_escalation_email ON unit_escalations;
DROP FUNCTION IF EXISTS create_escalation_email_notification();

-- Create corrected trigger function
CREATE OR REPLACE FUNCTION create_escalation_email_notification()
RETURNS TRIGGER AS $$
DECLARE
  v_unit_title text;
  v_workstream_name text;
  v_program_name text;
  v_recipient_email text;
  v_recipient_role text;
  v_priority text;
  v_message text;
  v_subject text;
BEGIN
  -- Get unit, workstream, and program details
  SELECT
    u.title,
    w.name,
    p.name
  INTO
    v_unit_title,
    v_workstream_name,
    v_program_name
  FROM units u
  JOIN workstreams w ON u.workstream_id = w.id
  JOIN programs p ON w.program_id = p.id
  WHERE u.id = NEW.unit_id;

  -- Determine recipient based on escalation level
  CASE NEW.level
    WHEN 1 THEN
      v_recipient_role := 'WORKSTREAM_LEAD';
      v_priority := 'normal';
    WHEN 2 THEN
      v_recipient_role := 'PROGRAM_OWNER';
      v_priority := 'high';
    ELSE
      v_recipient_role := 'PLATFORM_ADMIN';
      v_priority := 'critical';
  END CASE;

  -- Get recipient email (first user with this role)
  SELECT email INTO v_recipient_email
  FROM profiles
  WHERE role = v_recipient_role
  LIMIT 1;

  -- If no recipient found, default to platform admin
  IF v_recipient_email IS NULL THEN
    SELECT email INTO v_recipient_email
    FROM profiles
    WHERE role = 'PLATFORM_ADMIN'
    LIMIT 1;

    v_recipient_role := 'PLATFORM_ADMIN';
  END IF;

  -- Build email subject and message
  v_subject := format('🚨 Escalation Level %s: %s', NEW.level, v_unit_title);
  v_message := format(
    'Unit "%s" in workstream "%s" (Program: %s) has been escalated to Level %s.

This unit requires immediate attention as it has exceeded the deadline threshold by %s minutes.

Please review and take appropriate action.',
    v_unit_title,
    v_workstream_name,
    v_program_name,
    NEW.level,
    NEW.threshold_minutes_past_deadline
  );

  -- Create escalation notification
  INSERT INTO escalation_notifications (
    escalation_id,
    unit_id,
    recipient_email,
    recipient_role,
    channel,
    status,
    metadata
  )
  VALUES (
    NEW.id,
    NEW.unit_id,
    v_recipient_email,
    v_recipient_role,
    'email',
    'pending',
    jsonb_build_object(
      'subject', v_subject,
      'message', v_message,
      'priority', v_priority,
      'unit_title', v_unit_title,
      'workstream_name', v_workstream_name,
      'program_name', v_program_name,
      'escalation_level', NEW.level,
      'threshold_minutes', NEW.threshold_minutes_past_deadline
    )
  );

  RAISE NOTICE 'Created email notification for escalation level % to %', NEW.level, v_recipient_email;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger
CREATE TRIGGER trigger_create_escalation_email
  AFTER INSERT ON unit_escalations
  FOR EACH ROW
  EXECUTE FUNCTION create_escalation_email_notification();

COMMENT ON FUNCTION create_escalation_email_notification IS 'Automatically creates email notification when escalation is created. Uses correct column name: level (not escalation_level)';
