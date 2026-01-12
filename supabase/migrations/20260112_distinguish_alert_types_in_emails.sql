-- ============================================================================
-- DISTINGUISH ALERT TYPES IN EMAILS
-- Migration: 20260112_distinguish_alert_types_in_emails.sql
-- Date: 2026-01-12
--
-- PURPOSE: Clearly distinguish automatic deadline alerts from manual escalations
-- IMPACT: Email recipients will immediately know if it's an automated alert or
--         a manual site issue escalation reported by a user
-- ============================================================================

-- Update the email notification trigger to distinguish automatic alerts
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
  v_is_manual boolean;
BEGIN
  -- Check if this is a manual escalation
  v_is_manual := (NEW.escalation_type = 'manual');

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
  WHERE role::text = v_recipient_role
  LIMIT 1;

  -- If no recipient found, default to platform admin
  IF v_recipient_email IS NULL THEN
    SELECT email INTO v_recipient_email
    FROM profiles
    WHERE role::text = 'PLATFORM_ADMIN'
    LIMIT 1;

    v_recipient_role := 'PLATFORM_ADMIN';
  END IF;

  -- Build email subject and message based on alert type
  IF v_is_manual THEN
    -- Manual escalation: Site issue reported by user
    v_subject := format('🚨 [MANUAL ESCALATION] Level %s: %s', NEW.level, v_unit_title);
    v_message := format(
      'MANUAL SITE ISSUE ESCALATION

Unit: "%s"
Workstream: "%s"
Program: %s
Escalation Level: %s

Reason: %s

This is a manual escalation reported by a team member regarding a site issue. Please review and respond immediately.',
      v_unit_title,
      v_workstream_name,
      v_program_name,
      NEW.level,
      COALESCE(NEW.escalation_reason, 'No reason provided')
    );
  ELSE
    -- Automatic alert: Deadline exceeded
    v_subject := format('⏰ [AUTOMATIC ALERT] Level %s: %s (%s min overdue)',
      NEW.level,
      v_unit_title,
      NEW.threshold_minutes_past_deadline
    );
    v_message := format(
      'AUTOMATIC DEADLINE ALERT

Unit: "%s"
Workstream: "%s"
Program: %s
Alert Level: %s
Time Past Deadline: %s minutes

This unit has exceeded its deadline threshold and requires attention. This is an automated alert based on deadline tracking.

Please review and take appropriate action.',
      v_unit_title,
      v_workstream_name,
      v_program_name,
      NEW.level,
      NEW.threshold_minutes_past_deadline
    );
  END IF;

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
      'escalation_type', NEW.escalation_type,
      'is_manual', v_is_manual,
      'threshold_minutes', NEW.threshold_minutes_past_deadline,
      'escalation_reason', NEW.escalation_reason
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION create_escalation_email_notification IS 'Creates email notifications with clear distinction: [MANUAL ESCALATION] for site issues vs [AUTOMATIC ALERT] for deadline breaches';
