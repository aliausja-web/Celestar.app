-- RLS policies for the private voice-notes storage bucket.
-- Files are stored as {org_id}/{workstream_id}/{timestamp}.webm
-- The first path segment is always the org_id, enforcing tenant isolation.
-- Uploads are done server-side via the service role key (bypasses RLS),
-- but these policies act as a second layer if direct client access is ever attempted.

CREATE POLICY "voice_notes_select_own_org" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'voice-notes'
  AND (string_to_array(name, '/'))[1] = (
    SELECT org_id::text FROM profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "voice_notes_insert_own_org" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'voice-notes'
  AND (string_to_array(name, '/'))[1] = (
    SELECT org_id::text FROM profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "voice_notes_delete_own_org" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'voice-notes'
  AND (string_to_array(name, '/'))[1] = (
    SELECT org_id::text FROM profiles WHERE id = auth.uid()
  )
);
