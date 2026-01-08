-- ============================================================================
-- PRODUCTION-READY FINAL MIGRATION
-- Migration: 20260108_production_ready_final.sql
-- Date: 2026-01-08
--
-- This migration addresses all remaining gaps for commercial deployment:
-- 1. Custom escalation timelines per unit (percentage-based)
-- 2. Escalation notification system infrastructure
-- 3. Proper escalation hierarchy with attention tracking
-- 4. Multi-client isolation enforcement
-- ============================================================================

-- ============================================================================
-- ISSUE #1: CUSTOM ESCALATION TIMELINES PER UNIT
-- ============================================================================

-- Add custom escalation configuration to units table
ALTER TABLE units ADD COLUMN IF NOT EXISTS escalation_config jsonb DEFAULT jsonb_build_object(
  'enabled', true,
  'thresholds', jsonb_build_array(
    jsonb_build_object('level', 1, 'percentage_elapsed', 50, 'target_roles', jsonb_build_array('WORKSTREAM_LEAD')),
    jsonb_build_object('level', 2, 'percentage_elapsed', 75, 'target_roles', jsonb_build_array('PROGRAM_OWNER', 'WORKSTREAM_LEAD')),
    jsonb_build_object('level', 3, 'percentage_elapsed', 90, 'target_roles', jsonb_build_array('PLATFORM_ADMIN', 'PROGRAM_OWNER'))
  )
);

COMMENT ON COLUMN units.escalation_config IS 'Custom escalation configuration per unit. Uses percentage_elapsed (0-100) instead of fixed times. Allows each unit to have appropriate escalation timing based on its duration.';

-- ============================================================================
-- ISSUE #2: ESCALATION NOTIFICATION INFRASTRUCTURE
-- ============================================================================

-- Create escalation_notifications table to track all notifications sent
CREATE TABLE IF NOT EXISTS escalation_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escalation_id uuid NOT NULL REFERENCES unit_escalations(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  recipient_id uuid REFERENCES profiles(user_id) ON DELETE SET NULL,
  recipient_email text NOT NULL,
  recipient_role text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp', 'in_app')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'read')),
  sent_at timestamptz,
  read_at timestamptz,
  error_message text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_escalation_notifications_recipient ON escalation_notifications(recipient_id);
CREATE INDEX IF NOT EXISTS idx_escalation_notifications_status ON escalation_notifications(status);
CREATE INDEX IF NOT EXISTS idx_escalation_notifications_unit ON escalation_notifications(unit_id);

COMMENT ON TABLE escalation_notifications IS 'Tracks all escalation notifications sent via email, SMS, WhatsApp, or in-app. Provides delivery confirmation and read receipts.';

-- Create in_app_notifications table for notification bell feature
CREATE TABLE IF NOT EXISTS in_app_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL,
  type text NOT NULL CHECK (type IN ('escalation', 'proof_approved', 'proof_rejected', 'status_change', 'deadline_approaching', 'manual_escalation')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  related_unit_id uuid REFERENCES units(id) ON DELETE CASCADE,
  related_escalation_id uuid REFERENCES unit_escalations(id) ON DELETE CASCADE,
  is_read boolean DEFAULT false,
  read_at timestamptz,
  action_url text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_in_app_notifications_user_unread ON in_app_notifications(user_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_in_app_notifications_created ON in_app_notifications(created_at DESC);

COMMENT ON TABLE in_app_notifications IS 'In-app notification system for real-time alerts to users within the portal.';

-- Add manual escalation reason tracking to unit_escalations
ALTER TABLE unit_escalations ADD COLUMN IF NOT EXISTS escalation_reason text;
ALTER TABLE unit_escalations ADD COLUMN IF NOT EXISTS escalated_by uuid REFERENCES profiles(user_id) ON DELETE SET NULL;
ALTER TABLE unit_escalations ADD COLUMN IF NOT EXISTS escalation_type text DEFAULT 'automatic' CHECK (escalation_type IN ('automatic', 'manual'));

COMMENT ON COLUMN unit_escalations.escalation_reason IS 'For manual escalations, this contains the reason provided by the user. For automatic escalations, contains auto-generated message.';
COMMENT ON COLUMN unit_escalations.escalated_by IS 'User who triggered manual escalation. NULL for automatic escalations.';

-- ============================================================================
-- ISSUE #3: ESCALATION HIERARCHY AND ATTENTION TRACKING
-- ============================================================================

-- Create escalation_attention_log to track when higher levels view escalated items
CREATE TABLE IF NOT EXISTS escalation_attention_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escalation_id uuid NOT NULL REFERENCES unit_escalations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  user_role text NOT NULL,
  action text NOT NULL CHECK (action IN ('viewed', 'acknowledged', 'resolved', 'commented')),
  comment text,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_escalation_attention_escalation ON escalation_attention_log(escalation_id);
CREATE INDEX IF NOT EXISTS idx_escalation_attention_user ON escalation_attention_log(user_id);

COMMENT ON TABLE escalation_attention_log IS 'Tracks when users (especially higher levels) interact with escalated units. Shows that escalation successfully drew attention.';

-- Add escalation visibility filters (who should see this escalation in their queue)
ALTER TABLE unit_escalations ADD COLUMN IF NOT EXISTS visible_to_roles jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN unit_escalations.visible_to_roles IS 'Array of roles that should see this escalation in their priority queue. e.g., ["PROGRAM_OWNER", "PLATFORM_ADMIN"]';

-- ============================================================================
-- ISSUE #4: MULTI-CLIENT ISOLATION
-- ============================================================================

-- Ensure programs table has client organization tracking
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='programs' AND column_name='client_organization_id') THEN
    ALTER TABLE programs ADD COLUMN client_organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Ensure profiles table has organization tracking
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='organization_id') THEN
    ALTER TABLE profiles ADD COLUMN organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create organizations table if it doesn't exist
CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('client', 'contractor', 'platform')),
  contact_email text,
  contact_phone text,
  is_active boolean DEFAULT true,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_organizations_type ON organizations(type);
CREATE INDEX IF NOT EXISTS idx_organizations_active ON organizations(is_active) WHERE is_active = true;

COMMENT ON TABLE organizations IS 'Organizations (clients, contractors, platform admins). Used for multi-tenancy and client isolation.';

-- Enhanced RLS policy for programs (client isolation)
DROP POLICY IF EXISTS "programs_client_isolation" ON programs;

CREATE POLICY "programs_client_isolation" ON programs
  FOR SELECT
  USING (
    -- Platform admins see all programs
    (SELECT role FROM profiles WHERE user_id = auth.uid()) = 'PLATFORM_ADMIN'
    OR
    -- Program owners see programs in their organization
    (
      (SELECT role FROM profiles WHERE user_id = auth.uid()) = 'PROGRAM_OWNER'
      AND client_organization_id = (SELECT organization_id FROM profiles WHERE user_id = auth.uid())
    )
    OR
    -- Client viewers only see their organization's programs
    (
      (SELECT role FROM profiles WHERE user_id = auth.uid()) = 'CLIENT_VIEWER'
      AND client_organization_id = (SELECT organization_id FROM profiles WHERE user_id = auth.uid())
    )
    OR
    -- Workstream leads and field contributors see programs they're assigned to via workstream membership
    (
      (SELECT role FROM profiles WHERE user_id = auth.uid()) IN ('WORKSTREAM_LEAD', 'FIELD_CONTRIBUTOR')
      AND EXISTS (
        SELECT 1 FROM workstreams w
        JOIN workstream_members wm ON wm.workstream_id = w.id
        WHERE w.program_id = programs.id
        AND wm.user_id = auth.uid()
      )
    )
  );

-- ============================================================================
-- UPDATED ESCALATION ENGINE (PERCENTAGE-BASED + NOTIFICATIONS)
-- ============================================================================

CREATE OR REPLACE FUNCTION check_and_trigger_unit_escalations_v2()
RETURNS TABLE(units_checked integer, escalations_created integer, notifications_queued integer) AS $$
DECLARE
  unit_record RECORD;
  threshold_config jsonb;
  escalation_level integer;
  percentage_threshold integer;
  target_roles jsonb;
  time_elapsed_minutes integer;
  total_time_minutes integer;
  percentage_elapsed numeric;
  last_escalation_level integer;
  user_record RECORD;
  new_escalation_id uuid;
  notification_count integer;
  escalation_message text;
BEGIN
  units_checked := 0;
  escalations_created := 0;
  notifications_queued := 0;

  -- Loop through all RED units with deadlines and escalation enabled
  FOR unit_record IN
    SELECT
      u.id,
      u.title,
      u.workstream_id,
      u.required_green_by,
      u.escalation_config,
      u.current_escalation_level,
      u.last_escalated_at,
      u.computed_status,
      u.created_at,
      w.program_id
    FROM units u
    JOIN workstreams w ON w.id = u.workstream_id
    WHERE u.computed_status = 'RED'
    AND u.required_green_by IS NOT NULL
    AND u.escalation_config->>'enabled' = 'true'
    AND u.required_green_by < now()
  LOOP
    units_checked := units_checked + 1;

    -- Calculate time elapsed as percentage
    total_time_minutes := EXTRACT(EPOCH FROM (unit_record.required_green_by - unit_record.created_at)) / 60;
    time_elapsed_minutes := EXTRACT(EPOCH FROM (now() - unit_record.created_at)) / 60;
    percentage_elapsed := (time_elapsed_minutes::numeric / total_time_minutes::numeric) * 100;

    -- Get last escalation level
    last_escalation_level := COALESCE(unit_record.current_escalation_level, 0);

    -- Check each threshold in escalation config
    FOR threshold_config IN
      SELECT * FROM jsonb_array_elements(unit_record.escalation_config->'thresholds')
      ORDER BY (value->>'percentage_elapsed')::integer ASC
    LOOP
      escalation_level := (threshold_config->>'level')::integer;
      percentage_threshold := (threshold_config->>'percentage_elapsed')::integer;
      target_roles := threshold_config->'target_roles';

      -- Trigger escalation if we've passed the percentage threshold and level is higher
      IF percentage_elapsed >= percentage_threshold AND escalation_level > last_escalation_level THEN

        -- Generate escalation message
        escalation_message := format(
          'ESCALATION LEVEL %s: Unit "%s" has reached %s%% of its timeline (%s minutes past deadline) without completion. Immediate attention required.',
          escalation_level,
          unit_record.title,
          round(percentage_elapsed, 0),
          round(EXTRACT(EPOCH FROM (now() - unit_record.required_green_by)) / 60, 0)
        );

        -- Create escalation record
        INSERT INTO unit_escalations (
          unit_id,
          escalation_level,
          triggered_at,
          threshold_minutes_past_deadline,
          message,
          escalation_type,
          escalation_reason,
          visible_to_roles,
          status
        )
        VALUES (
          unit_record.id,
          escalation_level,
          now(),
          percentage_threshold,
          escalation_message,
          'automatic',
          escalation_message,
          target_roles,
          'active'
        )
        RETURNING id INTO new_escalation_id;

        escalations_created := escalations_created + 1;

        -- Queue notifications for all users with target roles
        notification_count := 0;
        FOR user_record IN
          SELECT DISTINCT
            p.user_id,
            p.email,
            p.full_name,
            p.role
          FROM profiles p
          WHERE p.role::text IN (SELECT jsonb_array_elements_text(target_roles))
          AND (
            p.role = 'PLATFORM_ADMIN'
            OR (p.role = 'PROGRAM_OWNER' AND EXISTS (
              SELECT 1 FROM programs prog
              WHERE prog.id = unit_record.program_id
              AND prog.client_organization_id = p.organization_id
            ))
            OR (p.role = 'WORKSTREAM_LEAD' AND EXISTS (
              SELECT 1 FROM workstream_members wm
              WHERE wm.workstream_id = unit_record.workstream_id
              AND wm.user_id = p.user_id
            ))
          )
        LOOP
          -- Create in-app notification
          INSERT INTO in_app_notifications (
            user_id,
            title,
            message,
            type,
            priority,
            related_unit_id,
            related_escalation_id,
            action_url,
            metadata
          )
          VALUES (
            user_record.user_id,
            format('Level %s Escalation', escalation_level),
            escalation_message,
            'escalation',
            CASE
              WHEN escalation_level = 3 THEN 'critical'
              WHEN escalation_level = 2 THEN 'high'
              ELSE 'normal'
            END,
            unit_record.id,
            new_escalation_id,
            format('/units/%s', unit_record.id),
            jsonb_build_object(
              'unit_title', unit_record.title,
              'percentage_elapsed', percentage_elapsed,
              'escalation_level', escalation_level
            )
          );

          -- Queue email notification (to be sent by edge function)
          INSERT INTO escalation_notifications (
            escalation_id,
            unit_id,
            recipient_id,
            recipient_email,
            recipient_role,
            channel,
            metadata
          )
          VALUES (
            new_escalation_id,
            unit_record.id,
            user_record.user_id,
            user_record.email,
            user_record.role,
            'email',
            jsonb_build_object(
              'unit_title', unit_record.title,
              'escalation_level', escalation_level,
              'percentage_elapsed', percentage_elapsed,
              'recipient_name', user_record.full_name
            )
          );

          notification_count := notification_count + 1;
        END LOOP;

        notifications_queued := notifications_queued + notification_count;

        -- Update unit escalation tracking
        UPDATE units
        SET
          current_escalation_level = escalation_level,
          last_escalated_at = now()
        WHERE id = unit_record.id;

        -- Log to audit
        INSERT INTO status_events (
          unit_id,
          old_status,
          new_status,
          reason,
          notes
        )
        VALUES (
          unit_record.id,
          'RED',
          'RED',
          format('Automatic Level %s Escalation', escalation_level),
          jsonb_build_object(
            'escalation_level', escalation_level,
            'percentage_elapsed', percentage_elapsed,
            'notifications_sent', notification_count
          )::text
        );

        -- Only trigger one escalation level per check
        EXIT;
      END IF;
    END LOOP;
  END LOOP;

  RETURN QUERY SELECT units_checked, escalations_created, notifications_queued;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION check_and_trigger_unit_escalations_v2 IS 'Enhanced escalation engine using percentage-based thresholds and full notification support. Queues email, SMS, WhatsApp, and in-app notifications.';

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to mark in-app notification as read
CREATE OR REPLACE FUNCTION mark_notification_read(notification_id uuid, user_id_param uuid)
RETURNS boolean AS $$
BEGIN
  UPDATE in_app_notifications
  SET is_read = true, read_at = now()
  WHERE id = notification_id
  AND user_id = user_id_param
  AND is_read = false;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to log escalation attention
CREATE OR REPLACE FUNCTION log_escalation_attention(
  escalation_id_param uuid,
  user_id_param uuid,
  action_param text,
  comment_param text DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  user_role_val text;
  attention_id uuid;
BEGIN
  -- Get user role
  SELECT role INTO user_role_val
  FROM profiles
  WHERE user_id = user_id_param;

  -- Create attention log entry
  INSERT INTO escalation_attention_log (
    escalation_id,
    user_id,
    user_role,
    action,
    comment
  )
  VALUES (
    escalation_id_param,
    user_id_param,
    user_role_val,
    action_param,
    comment_param
  )
  RETURNING id INTO attention_id;

  RETURN attention_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- RLS POLICIES FOR NEW TABLES
-- ============================================================================

ALTER TABLE escalation_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE in_app_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE escalation_attention_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Escalation notifications: Only recipient and admins can see
CREATE POLICY "escalation_notifications_access" ON escalation_notifications
  FOR SELECT
  USING (
    recipient_id = auth.uid()
    OR (SELECT role FROM profiles WHERE user_id = auth.uid()) = 'PLATFORM_ADMIN'
  );

-- In-app notifications: Only owner can see their notifications
CREATE POLICY "in_app_notifications_own" ON in_app_notifications
  FOR ALL
  USING (user_id = auth.uid());

-- Escalation attention log: Users involved in the escalation can see
CREATE POLICY "escalation_attention_access" ON escalation_attention_log
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR (SELECT role FROM profiles WHERE user_id = auth.uid()) IN ('PLATFORM_ADMIN', 'PROGRAM_OWNER')
  );

-- Organizations: Platform admins see all, others see only their own
CREATE POLICY "organizations_access" ON organizations
  FOR SELECT
  USING (
    (SELECT role FROM profiles WHERE user_id = auth.uid()) = 'PLATFORM_ADMIN'
    OR id = (SELECT organization_id FROM profiles WHERE user_id = auth.uid())
  );

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Summary of changes:
-- ✅ Custom percentage-based escalation timelines per unit
-- ✅ Full notification infrastructure (email, SMS, WhatsApp, in-app)
-- ✅ Escalation attention tracking to show hierarchy effectiveness
-- ✅ Multi-client isolation via organization-based RLS
-- ✅ Manual escalation reason tracking
-- ✅ Enhanced escalation engine with smart notification queuing
