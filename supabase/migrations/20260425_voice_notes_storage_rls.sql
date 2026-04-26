-- RLS policies for the public voice-notes storage bucket.
-- Files are stored as {workstream_id}/{timestamp}.webm
-- Reads are public (bucket is public). Writes require an authenticated session.

CREATE POLICY "voice_notes_insert_authenticated" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'voice-notes');

CREATE POLICY "voice_notes_delete_own" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'voice-notes'
  AND owner = auth.uid()
);
