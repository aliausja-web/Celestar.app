-- Add management notes (text) and voice note URL to units
-- management_notes replaces the old acceptance_criteria/completion-conditions field
-- as the channel for workstream leads to leave instructions for field teams.
-- voice_note_url stores the Supabase Storage public URL for recorded audio.

ALTER TABLE units ADD COLUMN IF NOT EXISTS management_notes text;
ALTER TABLE units ADD COLUMN IF NOT EXISTS voice_note_url text;
