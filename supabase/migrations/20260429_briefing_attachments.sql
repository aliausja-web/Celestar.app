-- Add briefing_attachments to units
-- Stores reference materials (images, videos, PDFs, planograms, 3D designs, etc.)
-- that managers upload to brief field workers on requirements.
-- Each entry: { id, url, name, mime_type, size, comment, uploaded_at }

ALTER TABLE units ADD COLUMN IF NOT EXISTS briefing_attachments jsonb DEFAULT '[]'::jsonb;

-- Storage bucket for briefing reference files (create via Supabase dashboard or CLI)
-- Bucket name: briefing-files
-- Public: true (files referenced by public URL, same pattern as voice-notes)
-- Recommended RLS: allow authenticated users in same org to read; allow WORKSTREAM_LEAD+ to upload
