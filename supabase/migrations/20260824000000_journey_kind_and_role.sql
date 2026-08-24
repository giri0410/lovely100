-- P1a: solo-first groundwork. Additive only — no renames, no drops, so the
-- currently deployed app keeps working after this runs.
--
-- Two changes:
--
-- 1. `kind` on a journey, so copy can be honest about whether one person or two
--    are involved. This is stored rather than derived from member count on
--    purpose: a shared journey whose partner hasn't accepted their invite yet
--    has exactly one member, and inferring would show solo wording and then
--    flip the moment they join.
--
-- 2. `relationship` becomes free text in practice. The column already is text;
--    what changes is the default, because "partner" was only ever right for the
--    couples case. The old UI offered exactly two options, "me" and "wife",
--    which is both wrong for most couples and meaningless for a solo user.

BEGIN;

ALTER TABLE public.couples
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'solo';

-- Constrained rather than an enum: enum migrations are the most tedious kind,
-- and this is unlikely to grow past two values.
ALTER TABLE public.couples
  DROP CONSTRAINT IF EXISTS couples_kind_check;
ALTER TABLE public.couples
  ADD CONSTRAINT couples_kind_check CHECK (kind IN ('solo', 'shared'));

-- One-time backfill. Every journey that predates this column was created as a
-- couple, so anything already holding more than one member is shared. This is a
-- migration-time judgement, not runtime inference.
UPDATE public.couples c
SET kind = 'shared'
WHERE (SELECT count(*) FROM public.profiles p WHERE p.couple_id = c.id) > 1;

-- Joining somebody else's journey makes it shared by definition, whatever it
-- was created as. Rewritten wholesale rather than patched so the new behaviour
-- is visible in one place.
CREATE OR REPLACE FUNCTION public.join_couple_by_code(_invite_code text, _name text, _relationship text)
RETURNS public.couples
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target public.couples;
BEGIN
  SELECT * INTO target
  FROM public.couples
  WHERE invite_code = upper(trim(_invite_code)) AND NOT is_demo;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'We could not find that invite code';
  END IF;

  INSERT INTO public.profiles (auth_user_id, couple_id, name, relationship)
  VALUES (auth.uid(), target.id, _name, NULLIF(trim(_relationship), ''));

  UPDATE public.couples SET kind = 'shared' WHERE id = target.id
  RETURNING * INTO target;

  RETURN target;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.join_couple_by_code(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_couple_by_code(text, text, text) TO authenticated;

-- Creating a journey now says up front whether it is for one person or two,
-- which is what makes "solo-first, invite to share" real rather than implied.
CREATE OR REPLACE FUNCTION public.create_couple_with_profile(
  _couple_name text,
  _profile_name text,
  _relationship text,
  _kind text DEFAULT 'solo'
)
RETURNS public.couples
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_couple public.couples;
BEGIN
  IF _kind NOT IN ('solo', 'shared') THEN
    RAISE EXCEPTION 'kind must be solo or shared';
  END IF;

  INSERT INTO public.couples (name, kind)
  VALUES (
    COALESCE(NULLIF(trim(_couple_name), ''), _profile_name || '''s 100 days'),
    _kind
  )
  RETURNING * INTO new_couple;

  INSERT INTO public.profiles (auth_user_id, couple_id, name, relationship)
  VALUES (auth.uid(), new_couple.id, _profile_name, NULLIF(trim(_relationship), ''));

  RETURN new_couple;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_couple_with_profile(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_couple_with_profile(text, text, text, text) TO authenticated;

COMMIT;

-- CORRECTION (see 20260824002000): the note that used to sit here claimed the
-- surviving 3-argument overload kept the deployed frontend working. It did the
-- opposite. Adding _kind via CREATE OR REPLACE created a second function rather
-- than replacing the first, so a 3-argument call matched both candidates and
-- PostgREST rejected it with PGRST203 instead of choosing — breaking onboarding
-- for every new signup until the 4-argument frontend shipped.
--
-- Left here rather than quietly deleted: "CREATE OR REPLACE plus a new
-- parameter" reads like an in-place change and is not one. Migration
-- 20260824002000 drops the stale signature.
