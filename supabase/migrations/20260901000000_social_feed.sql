-- P7: social feed — posts and follows.
--
-- First cross-journey data in the schema. Every previous table is scoped to a
-- single journey via journey_id. The feed intentionally crosses that boundary:
-- a member can follow anyone and read their public posts regardless of journey.
--
-- DESIGN DECISIONS
-- 1. Posts key on author_member_id (not auth_user_id) — consistent with all
--    other tables; my_member_id() RLS helper already exists.
-- 2. No author_name denormalisation — members.name is mutable; always join.
-- 3. visibility is a CHECK-constrained text column, not a PG enum — matches
--    the existing cadence/metric pattern; easier to extend inside a tx.
-- 4. follows uses a composite PK — (follower, following) is unique by
--    definition; no need for a surrogate id.
-- 5. No likes, no comments — zero engagement-metric columns, by design.
-- 6. discover_members() RPC is SECURITY DEFINER to aggregate across posts
--    without PostgREST client filter limitations.

BEGIN;

CREATE TABLE public.posts (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  author_member_id uuid        NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  journey_id       uuid        NOT NULL REFERENCES public.journeys(id) ON DELETE CASCADE,
  log_id           uuid        REFERENCES public.logs(id) ON DELETE SET NULL,
  body             text        NOT NULL,
  visibility       text        NOT NULL DEFAULT 'public',
  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT posts_body_nonempty    CHECK (length(trim(body)) > 0),
  CONSTRAINT posts_visibility_check CHECK (visibility IN ('public'))
);

CREATE INDEX posts_created_at_idx ON public.posts (created_at DESC);
CREATE INDEX posts_author_idx     ON public.posts (author_member_id, created_at DESC);

CREATE TABLE public.follows (
  follower_member_id  uuid        NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  following_member_id uuid        NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  created_at          timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (follower_member_id, following_member_id),
  CONSTRAINT follows_no_self CHECK (follower_member_id <> following_member_id)
);

CREATE INDEX follows_follower_idx  ON public.follows (follower_member_id);
CREATE INDEX follows_following_idx ON public.follows (following_member_id);

COMMIT;

BEGIN;

ALTER TABLE public.posts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "posts_select" ON public.posts;
CREATE POLICY "posts_select" ON public.posts FOR SELECT TO authenticated
  USING (visibility = 'public');

DROP POLICY IF EXISTS "posts_insert" ON public.posts;
CREATE POLICY "posts_insert" ON public.posts FOR INSERT TO authenticated
  WITH CHECK (author_member_id = public.my_member_id());

DROP POLICY IF EXISTS "posts_delete" ON public.posts;
CREATE POLICY "posts_delete" ON public.posts FOR DELETE TO authenticated
  USING (author_member_id = public.my_member_id());

DROP POLICY IF EXISTS "follows_select" ON public.follows;
CREATE POLICY "follows_select" ON public.follows FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "follows_insert" ON public.follows;
CREATE POLICY "follows_insert" ON public.follows FOR INSERT TO authenticated
  WITH CHECK (follower_member_id = public.my_member_id());

DROP POLICY IF EXISTS "follows_delete" ON public.follows;
CREATE POLICY "follows_delete" ON public.follows FOR DELETE TO authenticated
  USING (follower_member_id = public.my_member_id());

COMMIT;

BEGIN;

CREATE OR REPLACE FUNCTION public.discover_members(
  _member_id uuid,
  _limit     int DEFAULT 10
)
RETURNS TABLE (
  member_id      uuid,
  name           text,
  avatar         text,
  last_posted_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id          AS member_id,
    m.name,
    m.avatar,
    max(p.created_at) AS last_posted_at
  FROM public.posts p
  JOIN public.members m ON m.id = p.author_member_id
  WHERE
    p.visibility = 'public'
    AND p.author_member_id <> _member_id
    AND p.author_member_id NOT IN (
      SELECT following_member_id
      FROM public.follows
      WHERE follower_member_id = _member_id
    )
  GROUP BY m.id, m.name, m.avatar
  ORDER BY last_posted_at DESC
  LIMIT _limit;
$$;

COMMIT;
