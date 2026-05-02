-- Fix: DB trigger was firing for manual escalations in addition to the API-level
-- notification already created by /api/units/[id]/escalate, causing a duplicate
-- notification without the escalation reason. Skip the trigger when recipients
-- indicates a manual escalation (type = 'manual').

CREATE OR REPLACE FUNCTION create_escalation_inapp_notification()
RETURNS TRIGGER AS $$
DECLARE
  v_unit_title text;
  v_workstream_name text;
  v_program_name text;
  v_org_id uuid;
  v_user_record RECORD;
  v_priority text;
  v_title text;
  v_message text;
BEGIN
  -- Skip: manual escalations are handled directly by the API route which
  -- includes the reason and notifies all org users with full context.
  IF NEW.recipients IS NOT NULL
     AND jsonb_array_length(NEW.recipients) > 0
     AND (NEW.recipients->0->>'type') = 'manual' THEN
    RETURN NEW;
  END IF;

  -- Get unit, workstream, program details
  SELECT u.title, w.name, p.name, p.org_id
  INTO v_unit_title, v_workstream_name, v_program_name, v_org_id
  FROM units u
  JOIN workstreams w ON u.workstream_id = w.id
  JOIN programs p ON w.program_id = p.id
  WHERE u.id = NEW.unit_id;

  -- Determine priority based on escalation level
  v_priority := CASE
    WHEN NEW.level >= 3 THEN 'critical'
    WHEN NEW.level = 2 THEN 'high'
    ELSE 'normal'
  END;

  v_title := format('Escalation Level %s: %s', NEW.level, COALESCE(v_unit_title, 'Unknown Unit'));
  v_message := format(
    'Unit "%s" in workstream "%s" (Program: %s) has been escalated to Level %s. Please review and take action.',
    COALESCE(v_unit_title, 'Unknown'),
    COALESCE(v_workstream_name, 'Unknown'),
    COALESCE(v_program_name, 'Unknown'),
    NEW.level
  );

  -- Create in-app notifications for users based on escalation level
  FOR v_user_record IN
    SELECT DISTINCT user_id FROM profiles
    WHERE (
      -- Level 1+: Notify workstream leads in same org
      (NEW.level >= 1 AND role = 'WORKSTREAM_LEAD' AND org_id = v_org_id)
      OR
      -- Level 2+: Also notify program owners in same org
      (NEW.level >= 2 AND role = 'PROGRAM_OWNER' AND org_id = v_org_id)
      OR
      -- Level 3+: Also notify all platform admins
      (NEW.level >= 3 AND role = 'PLATFORM_ADMIN')
    )
  LOOP
    INSERT INTO in_app_notifications (
      user_id, title, message, type, priority,
      related_unit_id, related_escalation_id, action_url, metadata
    ) VALUES (
      v_user_record.user_id,
      v_title,
      v_message,
      'escalation',
      v_priority,
      NEW.unit_id,
      NEW.id,
      format('/units/%s', NEW.unit_id),
      jsonb_build_object(
        'escalation_level', NEW.level,
        'unit_title', v_unit_title,
        'workstream_name', v_workstream_name,
        'program_name', v_program_name
      )
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
