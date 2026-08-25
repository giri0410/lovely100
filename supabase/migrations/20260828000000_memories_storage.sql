-- P6: photos for memories.
--
-- The media table shipped in P2 with nowhere to point. This adds the bucket it
-- points into, and the row-level security that keeps one journey's photos out
-- of another's.
--
--
-- THE PATH SCHEME IS THE SECURITY BOUNDARY
--
-- Every object is stored as:
--
--     {journey_id}/{log_id}/{filename}
--
-- The first path segment is what the policies below check, so a client can
-- only ever read or write inside its own journey's folder. That is why the
-- journey id leads and is not, say, buried after a member id: RLS has to be
-- able to decide access from the prefix alone, without reading another table.
--
-- storage.foldername(name) returns the path segments excluding the filename,
-- so element 1 is the journey id.
--
--
-- THE BUCKET IS PRIVATE
--
-- public = false, so there is no unauthenticated URL for any object. The app
-- reads photos through short-lived signed URLs. A public bucket would make
-- every photo reachable by anyone who learned its path, which no RLS policy
-- could then undo.

BEGIN;

-- Private bucket, 10 MB per object, images only.
--
-- The MIME allow-list is enforced by Storage itself rather than trusted from
-- the client, because a client that can name its own content type can upload a
-- script and have it served back from our origin.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'memories',
  'memories',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

COMMIT;

-- ---------------------------------------------------------------------------
-- RLS on storage.objects, scoped to the leading journey-id segment.
--
-- Read is journey-wide and write is self-only, matching every other table in
-- this schema: you can see what the other person logged, and you can only add
-- or remove your own.
--
-- Except that storage.objects has no member_id to check "your own" against. It
-- has `owner`, the auth user id, which is exactly as good — and it is set by
-- Storage rather than supplied by the client.
-- ---------------------------------------------------------------------------

BEGIN;

DROP POLICY IF EXISTS "memories_select" ON storage.objects;
CREATE POLICY "memories_select" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'memories'
    AND (storage.foldername(name))[1] = public.my_journey_id()::text
  );

DROP POLICY IF EXISTS "memories_insert" ON storage.objects;
CREATE POLICY "memories_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'memories'
    AND (storage.foldername(name))[1] = public.my_journey_id()::text
    AND owner = auth.uid()
  );

-- No UPDATE policy at all. A photo is not edited in place: replacing one means
-- deleting it and uploading another, which keeps the media row and the object
-- in step instead of letting a path quietly point at different bytes.
DROP POLICY IF EXISTS "memories_update" ON storage.objects;

DROP POLICY IF EXISTS "memories_delete" ON storage.objects;
CREATE POLICY "memories_delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'memories'
    AND (storage.foldername(name))[1] = public.my_journey_id()::text
    AND owner = auth.uid()
  );

COMMIT;

-- ---------------------------------------------------------------------------
-- media gains an owner-side guard.
--
-- Its P2 policies resolve through the log, which is correct, but nothing
-- stopped a client inserting a media row whose storage_path pointed into
-- another journey's folder. The object itself would be unreadable — storage
-- RLS sees to that — but the row would still be there, and a signed-URL
-- request would be attempted for a path the caller has no business naming.
-- ---------------------------------------------------------------------------

BEGIN;

DROP POLICY IF EXISTS "media_insert" ON public.media;
CREATE POLICY "media_insert" ON public.media FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.logs l
      WHERE l.id = media.log_id AND l.member_id = public.my_member_id()
    )
    -- The path must sit inside this journey's folder.
    AND split_part(media.storage_path, '/', 1) = public.my_journey_id()::text
  );

COMMIT;

-- ---------------------------------------------------------------------------
-- Verification. Read-only.
-- ---------------------------------------------------------------------------

SELECT id, public, file_size_limit, allowed_mime_types
FROM storage.buckets WHERE id = 'memories';

SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'memories_%'
ORDER BY policyname;

SELECT policyname, cmd FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'media' ORDER BY policyname;
