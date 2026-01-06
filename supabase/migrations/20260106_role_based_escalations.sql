-- Role-Based Escalations Implementation
-- Migration: 20260106_role_based_escalations.sql
-- Requirement: Escalations target roles, not individuals

-- ============================================================================
-- 1. UPDATE ESCALATION POLICY STRUCTURE
-- ============================================================================

-- Escalation policies should now target ROLES instead of individual emails
-- Example escalation_policy structure:
/*
[
  {
    "level": 1,
    "threshold_minutes": 60,
    "target_roles": ["WORKSTREAM_LEAD"],
    "message_template": "Unit {{unit_title}} is RED and past deadline"
  },
  {
    "level": 2,
    "threshold_minutes": 120,
    "target_roles": ["PROGRAM_OWNER", "WORKSTREAM_LEAD"],
    "message_template": "URGENT: Unit {{unit_title}} requires immediate attention"
  },
  {
    "level": 3,
    "threshold_minutes": 240,
    "target_roles": ["PLATFORM_ADMIN", "PROGRAM_OWNER"],
    "message_template": "CRITICAL: Unit {{unit_title}} severely overdue"
  }
]
*/

-- ============================================================================
-- 2. UPDATE ESCALATION ENGINE TO BE ROLE-BASED
-- ============================================================================

CREATE OR REPLACE FUNCTION check_and_trigger_unit_escalations()
RETURNS TABLE(units_checked integer, escalations_created integer) AS $$
DECLARE
  unit_record RECORD;
  policy_step jsonb;
  escalation_level integer;
  threshold_minutes integer;
  target_roles jsonb;
  minutes_past_deadline integer;
  last_escalation_level integer;
  recipients_list jsonb;
  user_record RECORD;
BEGIN
  units_checked := 0;
  escalations_created := 0;

  -- Loop through all RED units with deadlines
  FOR unit_record IN
    SELECT
      u.id,
      u.title,
      u.workstream_id,
      u.required_green_by,
      u.escalation_policy,
      u.current_escalation_level,
      u.last_escalated_at,
      u.computed_status,
      w.program_id
    FROM units u
    JOIN workstreams w ON w.id = u.workstream_id
    WHERE u.computed_status = 'RED'
    AND u.required_green_by IS NOT NULL
    AND u.required_green_by < now()
    AND u.escalation_policy IS NOT NULL
  LOOP
    units_checked := units_checked + 1;

    -- Calculate minutes past deadline
    minutes_past_deadline := EXTRACT(EPOCH FROM (now() - unit_record.required_green_by)) / 60;

    -- Get last escalation level (default 0 if never escalated)
    last_escalation_level := COALESCE(unit_record.current_escalation_level, 0);

    -- Check each escalation policy step
    FOR policy_step IN SELECT * FROM jsonb_array_elements(unit_record.escalation_policy)
    LOOP
      escalation_level := (policy_step->>'level')::integer;
      threshold_minutes := (policy_step->>'threshold_minutes')::integer;
      target_roles := policy_step->'target_roles';

      -- Trigger escalation if:
      -- 1. We've passed the threshold
      -- 2. This level hasn't been triggered yet
      IF minutes_past_deadline >= threshold_minutes AND escalation_level > last_escalation_level THEN

        -- Build recipients list by querying users with target roles in this program/workstream
        recipients_list := '[]'::jsonb;

        -- Get users with the target roles who have access to this unit
        FOR user_record IN
          SELECT DISTINCT
            p.user_id,
            p.email,
            p.full_name,
            p.role
          FROM profiles p
          WHERE p.role::text IN (
            SELECT jsonb_array_elements_text(target_roles)
          )
          AND (
            -- Platform admins always included
            p.role = 'PLATFORM_ADMIN'
            OR
            -- Program owners with access to this program
            (p.role = 'PROGRAM_OWNER' AND EXISTS (
              SELECT 1 FROM programs prog
              WHERE prog.id = unit_record.program_id
              AND prog.org_id = p.org_id
            ))
            OR
            -- Workstream leads assigned to this workstream
            (p.role = 'WORKSTREAM_LEAD' AND EXISTS (
              SELECT 1 FROM workstream_members wm
              WHERE wm.workstream_id = unit_record.workstream_id
              AND wm.user_id = p.user_id
            ))
          )
        LOOP
          recipients_list := recipients_list || jsonb_build_object(
            'user_id', user_record.user_id,
            'email', user_record.email,
            'name', user_record.full_name,
            'role', user_record.role
          );
        END LOOP;

        -- Create escalation record
        INSERT INTO unit_escalations (
          unit_id,
          escalation_level,
          triggered_at,
          recipients,
          threshold_minutes_past_deadline,
          message,
          status
        )
        VALUES (
          unit_record.id,
          escalation_level,
          now(),
          recipients_list,
          threshold_minutes,
          replace(
            replace(
              policy_step->>'message_template',
              '{{unit_title}}',
              unit_record.title
            ),
            '{{minutes_overdue}}',
            minutes_past_deadline::text
          ),
          'active'
        );

        -- Update unit's escalation tracking
        UPDATE units
        SET
          current_escalation_level = escalation_level,
          last_escalated_at = now()
        WHERE id = unit_record.id;

        escalations_created := escalations_created + 1;

        -- Log to audit trail
        INSERT INTO status_events (
          unit_id,
          event_type,
          old_status,
          new_status,
          metadata
        )
        VALUES (
          unit_record.id,
          'escalation_triggered',
          'RED',
          'RED',
          jsonb_build_object(
            'escalation_level', escalation_level,
            'minutes_past_deadline', minutes_past_deadline,
            'target_roles', target_roles,
            'recipients_count', jsonb_array_length(recipients_list)
          )
        );

        -- Only trigger one escalation level per run
        EXIT;
      END IF;
    END LOOP;
  END LOOP;

  RETURN QUERY SELECT units_checked, escalations_created;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 3. ADD MESSAGE COLUMN TO UNIT_ESCALATIONS
-- ============================================================================

DO $$ BEGIN
  ALTER TABLE unit_escalations ADD COLUMN message text;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
