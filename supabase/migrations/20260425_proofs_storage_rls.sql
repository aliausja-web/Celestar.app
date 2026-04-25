-- RLS policies for the private proofs storage bucket.
-- Files are stored as {unit_id}/{timestamp}.{ext}
--
-- Reads are handled server-side via signed URLs (GET /api/units/[id] generates them).
-- This INSERT policy lets authenticated users upload from the browser directly
-- while keeping the bucket private (no public read access).

CREATE POLICY "proofs_insert_authenticated" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'proofs');

-- Allows the owner of an object to delete it (e.g. superseded proofs)
CREATE POLICY "proofs_delete_own" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'proofs'
  AND owner = auth.uid()
);
