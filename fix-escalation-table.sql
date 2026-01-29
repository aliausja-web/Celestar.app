-- Fix unit_escalations table - add missing columns
-- Run this in Supabase SQL Editor

-- Add missing columns to unit_escalations table
ALTER TABLE unit_escalations ADD COLUMN IF NOT EXISTS escalation_level integer DEFAULT 1;
ALTER TABLE unit_escalations ADD COLUMN IF NOT EXISTS escalation_type text DEFAULT 'manual';
ALTER TABLE unit_escalations ADD COLUMN IF NOT EXISTS escalation_reason text;
ALTER TABLE unit_escalations ADD COLUMN IF NOT EXISTS escalated_by uuid REFERENCES auth.users(id);
ALTER TABLE unit_escalations ADD COLUMN IF NOT EXISTS visible_to_roles text[];
ALTER TABLE unit_escalations ADD COLUMN IF NOT EXISTS message text;
ALTER TABLE unit_escalations ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';
ALTER TABLE unit_escalations ADD COLUMN IF NOT EXISTS proposed_blocked boolean DEFAULT false;
ALTER TABLE unit_escalations ADD COLUMN IF NOT EXISTS proposed_by_role text;
ALTER TABLE unit_escalations ADD COLUMN IF NOT EXISTS workstream_id uuid REFERENCES workstreams(id);

-- Add missing columns to units table for escalation tracking
ALTER TABLE units ADD COLUMN IF NOT EXISTS current_escalation_level integer DEFAULT 0;
ALTER TABLE units ADD COLUMN IF NOT EXISTS is_blocked boolean DEFAULT false;
ALTER TABLE units ADD COLUMN IF NOT EXISTS blocked_reason text;
ALTER TABLE units ADD COLUMN IF NOT EXISTS blocked_at timestamptz;
ALTER TABLE units ADD COLUMN IF NOT EXISTS blocked_by uuid REFERENCES auth.users(id);

-- Create escalation_notifications table if it doesn't exist
CREATE TABLE IF NOT EXISTS escalation_notifications (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    escalation_id uuid REFERENCES unit_escalations(id),
    recipient_user_id uuid REFERENCES auth.users(id),
    recipient_email text,
    recipient_name text,
    channel text DEFAULT 'email',
    subject text,
    message text,
    template_data jsonb,
    status text DEFAULT 'pending',
    sent_at timestamptz,
    created_at timestamptz DEFAULT now()
);

-- Create in_app_notifications table if it doesn't exist
CREATE TABLE IF NOT EXISTS in_app_notifications (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id),
    title text NOT NULL,
    message text,
    type text,
    priority text DEFAULT 'normal',
    related_unit_id uuid REFERENCES units(id),
    related_escalation_id uuid REFERENCES unit_escalations(id),
    action_url text,
    metadata jsonb,
    read_at timestamptz,
    created_at timestamptz DEFAULT now()
);

-- Grant permissions
GRANT ALL ON escalation_notifications TO authenticated;
GRANT ALL ON in_app_notifications TO authenticated;

-- Verify the changes
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'unit_escalations'
ORDER BY ordinal_position;
