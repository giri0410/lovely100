-- P1b: couples -> journeys, profiles -> members.
--
-- The product is no longer about couples. A person doing their 100 days alone
-- is the default case now, and storing them in a table called `couples` with a
-- `couple_id` on every row is a lie the next reader has to decode. This is the
-- last cheap moment to fix it: 18 rows total, and P2 is about to add goals,
-- logs and media that all carry a journey FK. Renaming after that means four
-- tables instead of two, or two vocabularies in one schema.
--
-- WHY THIS IS SHORTER THAN IT LOOKS
--
-- ALTER TABLE / ALTER COLUMN ... RENAME rewrites dependent objects by OID, so
-- the ~15 RLS policies, every FK, index and the daily_habits trigger follow
-- automatically. None are touched by hand below.
--
-- ALTER FUNCTION ... RENAME likewise preserves the OID, so policies whose
-- USING clause calls my_couple_id() keep working and end up calling
-- my_journey_id(). That is why the helpers are renamed *before* their bodies
-- are replaced, and never dropped: dropping them would fail on the policy
-- dependency, and recreating them under a new name would leave every policy
-- pointing at the old OID.
--
-- Function *bodies*, by contrast, are stored as text and re-parsed at call
-- time. They do NOT follow a rename, so all five are rewritten explicitly.
--
-- Lesson applied from 20260824002000: CREATE OR REPLACE with a changed
-- signature creates an overload rather than replacing. Both RPCs below change
-- name, so each old signature is DROPped explicitly. Nothing is left behind to
-- become ambiguous.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

ALTER TABLE public.couples  RENAME TO journeys;
ALTER TABLE public.profiles RENAME TO members;

-- ---------------------------------------------------------------------------
-- 2. Columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.members          RENAME COLUMN couple_id  TO journey_id;
ALTER TABLE public.daily_habits     RENAME COLUMN couple_id  TO journey_id;
ALTER TABLE public.avoided_expenses RENAME COLUMN couple_id  TO journey_id;
ALTER TABLE public.weekly_reviews   RENAME COLUMN couple_id  TO journey_id;

ALTER TABLE public.daily_habits     RENAME COLUMN profile_id TO member_id;
ALTER TABLE public.avoided_expenses RENAME COLUMN profile_id TO member_id;
ALTER TABLE public.weekly_reviews   RENAME COLUMN profile_id TO member_id;
ALTER TABLE public.reminders        RENAME COLUMN profile_id TO member_id;
ALTER TABLE public.reminder_sends   RENAME COLUMN profile_id TO member_id;

-- ---------------------------------------------------------------------------
-- 3. Helper functions: rename first (keeps the OID, so RLS policies follow),
--    then replace the body so it reads the renamed tables.
-- ---------------------------------------------------------------------------

ALTER FUNCTION public.my_couple_id()  RENAME TO my_journey_id;
ALTER FUNCTION public.my_profile_id() RENAME TO my_member_id;

CREATE OR REPLACE FUNCTION public.my_journey_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT journey_id FROM public.members WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.my_member_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.members WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.my_journey_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.my_member_id()  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.my_journey_id() TO authenticated;
GRANT  EXECUTE ON FUNCTION public.my_member_id()  TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. The two RPCs. Renamed, so the old signatures are dropped outright.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.create_couple_with_profile(text, text, text, text);
DROP FUNCTION IF EXISTS public.create_couple_with_profile(text, text, text);
DROP FUNCTION IF EXISTS public.join_couple_by_code(text, text, text);

CREATE FUNCTION public.create_journey_with_member(
  _journey_name text,
  _member_name  text,
  _relationship text,
  _kind         text DEFAULT 'solo'
)
RETURNS public.journeys
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_journey public.journeys;
BEGIN
  IF _kind NOT IN ('solo', 'shared') THEN
    RAISE EXCEPTION 'kind must be solo or shared';
  END IF;

  INSERT INTO public.journeys (name, kind)
  VALUES (
    COALESCE(NULLIF(trim(_journey_name), ''), _member_name || '''s 100 days'),
    _kind
  )
  RETURNING * INTO new_journey;

  INSERT INTO public.members (auth_user_id, journey_id, name, relationship)
  VALUES (auth.uid(), new_journey.id, _member_name, NULLIF(trim(_relationship), ''));

  RETURN new_journey;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_journey_with_member(text, text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_journey_with_member(text, text, text, text) TO authenticated;

CREATE FUNCTION public.join_journey_by_code(_invite_code text, _name text, _relationship text)
RETURNS public.journeys
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target public.journeys;
BEGIN
  SELECT * INTO target
  FROM public.journeys
  WHERE invite_code = upper(trim(_invite_code)) AND NOT is_demo;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'We could not find that invite code';
  END IF;

  INSERT INTO public.members (auth_user_id, journey_id, name, relationship)
  VALUES (auth.uid(), target.id, _name, NULLIF(trim(_relationship), ''));

  -- Joining somebody else's journey makes it shared by definition.
  UPDATE public.journeys SET kind = 'shared' WHERE id = target.id
  RETURNING * INTO target;

  RETURN target;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.join_journey_by_code(text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.join_journey_by_code(text, text, text) TO authenticated;

COMMIT;

-- ---------------------------------------------------------------------------
-- 5. reminders_due: renamed columns only, logic deliberately untouched.
--
-- DROP + CREATE rather than CREATE OR REPLACE because the RETURNS TABLE column
-- names change, and REPLACE cannot alter an output signature.
--
-- The partner columns become other_member_*, which is what the query actually
-- computes: LATERAL ... LIMIT 1 picks the oldest other member and ignores any
-- beyond that. Calling it "partner" implied a two-person guarantee the schema
-- never enforced.
--
-- Everything else is left exactly as it was, including two known problems that
-- P5 rewrites rather than patches: done_count should be an aggregate over the
-- member's goals instead of four hardcoded booleans, and reminder_sends needs
-- goal_id in its unique key or two goal reminders at the same time collapse
-- into a single send. Fixing them here would hide the rename in a redesign.
-- ---------------------------------------------------------------------------

BEGIN;

DROP FUNCTION IF EXISTS public.reminders_due(integer);

CREATE FUNCTION public.reminders_due(_window_minutes integer DEFAULT 5)
RETURNS TABLE (
  member_id uuid,
  member_name text,
  email text,
  reminder_type text,
  journey_name text,
  local_date date,
  day_number integer,
  week_number integer,
  walk_done boolean,
  food_done boolean,
  spending_done boolean,
  cert_done boolean,
  done_count integer,
  other_member_name text,
  other_member_done_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH clock AS (
    SELECT
      (now() AT TIME ZONE 'Asia/Kolkata')                                        AS ist,
      (now() AT TIME ZONE 'Asia/Kolkata')::date                                  AS local_date,
      (now() AT TIME ZONE 'Asia/Kolkata')::time                                  AS now_t,
      ((now() AT TIME ZONE 'Asia/Kolkata') - make_interval(mins => _window_minutes))::time AS from_t
  )
  SELECT
    m.id,
    m.name,
    u.email::text,
    r.reminder_type,
    j.name,
    k.local_date,
    (k.local_date - j.start_date + 1)::integer,
    ceil((k.local_date - j.start_date + 1) / 7.0)::integer,
    COALESCE(h.walk_completed, false),
    COALESCE(h.healthy_food_completed, false),
    COALESCE(h.unnecessary_spending_completed, false),
    COALESCE(h.certification_completed, false),
    (
      COALESCE(h.walk_completed, false)::int
      + COALESCE(h.healthy_food_completed, false)::int
      + COALESCE(h.unnecessary_spending_completed, false)::int
      + COALESCE(h.certification_completed, false)::int
    ),
    other.name,
    COALESCE(
      (
        COALESCE(oh.walk_completed, false)::int
        + COALESCE(oh.healthy_food_completed, false)::int
        + COALESCE(oh.unnecessary_spending_completed, false)::int
        + COALESCE(oh.certification_completed, false)::int
      ),
      0
    )
  FROM public.reminders r
  JOIN public.members  m ON m.id = r.member_id
  JOIN public.journeys j ON j.id = m.journey_id
  JOIN auth.users      u ON u.id = m.auth_user_id
  CROSS JOIN clock k
  LEFT JOIN public.daily_habits h ON h.member_id = m.id AND h.date = k.local_date
  -- One other member at most. LATERAL ... LIMIT 1 rather than a plain join
  -- because a journey with three members would otherwise emit one output row
  -- per extra member, and each would try to send. The ledger would absorb it,
  -- but not emitting duplicates is better than relying on that.
  LEFT JOIN LATERAL (
    SELECT mm.id, mm.name
    FROM public.members mm
    WHERE mm.journey_id = m.journey_id AND mm.id <> m.id
    ORDER BY mm.created_at
    LIMIT 1
  ) other ON true
  LEFT JOIN public.daily_habits oh ON oh.member_id = other.id AND oh.date = k.local_date
  LEFT JOIN public.reminder_sends s
         ON s.member_id = m.id
        AND s.reminder_type = r.reminder_type
        AND s.sent_for_date = k.local_date
  WHERE r.enabled
    AND s.id IS NULL                       -- not already handled today
    AND u.email IS NOT NULL
    AND u.email_confirmed_at IS NOT NULL   -- never mail an unverified address
    AND k.local_date >= j.start_date       -- journey has started
    AND k.local_date < j.start_date + j.duration  -- and hasn't finished
    -- The configured time fell inside the window we're catching up on.
    -- _window_minutes >= 1440 is called out on its own: subtracting exactly
    -- 24h (or any multiple of it) from a timestamp lands back on the same
    -- wall-clock time, so from_t = now_t and the "normal" branch below would
    -- demand reminder_time be both > X and <= X — impossible for any value.
    -- A window covering a full day or more should just mean "any time of
    -- day", so it's handled before the straddles-midnight CASE runs at all.
    AND (
      _window_minutes >= 1440
      OR CASE
           WHEN k.from_t <= k.now_t
             THEN r.reminder_time > k.from_t AND r.reminder_time <= k.now_t
           ELSE r.reminder_time > k.from_t OR  r.reminder_time <= k.now_t
         END
    )
    -- The weekly review only makes sense on a Sunday.
    AND (r.reminder_type <> 'weekly' OR EXTRACT(dow FROM k.local_date) = 0)
$$;

REVOKE ALL     ON FUNCTION public.reminders_due(integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.reminders_due(integer) TO service_role;

COMMIT;

-- ---------------------------------------------------------------------------
-- 6. Constraint and index names.
--
-- RENAME TABLE / RENAME COLUMN do not touch these, so without this step the
-- journeys table keeps a couples_pkey and daily_habits keeps a
-- daily_habits_profile_id_date_key. They are not just cosmetic: constraint
-- names appear verbatim in violation errors, so the old vocabulary would keep
-- surfacing in messages long after the rename.
--
-- Discovered from the catalog rather than hardcoded. There are around twenty,
-- every one auto-generated by Postgres, and RENAME CONSTRAINT has no IF EXISTS
-- — so a single stale guess would abort the whole migration. Looking them up
-- cannot go stale.
-- ---------------------------------------------------------------------------

BEGIN;

DO $$
DECLARE
  r       record;
  newname text;
BEGIN
  -- Constraints (PK, unique, FK, check). Renaming a constraint also renames
  -- the index backing it, so unique/PK indexes need no separate pass.
  FOR r IN
    SELECT c.conname, t.relname
    FROM pg_constraint c
    JOIN pg_class     t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname IN ('journeys','members','daily_habits',
                        'avoided_expenses','weekly_reviews',
                        'reminders','reminder_sends')
      AND (c.conname LIKE '%couple%' OR c.conname LIKE '%profile%')
  LOOP
    newname := replace(replace(r.conname,  'couples',  'journeys'), 'couple',  'journey');
    newname := replace(replace(newname,    'profiles', 'members'),  'profile', 'member');
    EXECUTE format('ALTER TABLE public.%I RENAME CONSTRAINT %I TO %I',
                   r.relname, r.conname, newname);
    RAISE NOTICE 'constraint %.% -> %', r.relname, r.conname, newname;
  END LOOP;

  -- Standalone indexes (those not owned by a constraint).
  FOR r IN
    SELECT i.relname AS conname, t.relname
    FROM pg_index     x
    JOIN pg_class     i ON i.oid = x.indexrelid
    JOIN pg_class     t ON t.oid = x.indrelid
    JOIN pg_namespace n ON n.oid = i.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname IN ('journeys','members','daily_habits',
                        'avoided_expenses','weekly_reviews',
                        'reminders','reminder_sends')
      AND (i.relname LIKE '%couple%' OR i.relname LIKE '%profile%')
      AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = i.oid)
  LOOP
    newname := replace(replace(r.conname,  'couples',  'journeys'), 'couple',  'journey');
    newname := replace(replace(newname,    'profiles', 'members'),  'profile', 'member');
    EXECUTE format('ALTER INDEX public.%I RENAME TO %I', r.conname, newname);
    RAISE NOTICE 'index %.% -> %', r.relname, r.conname, newname;
  END LOOP;

  -- Policy names. Their *expressions* follow the rename automatically (they
  -- are stored as parse trees, so journey_id = my_journey_id() came out
  -- correct on its own) but the names do not, leaving couples_select sitting
  -- on the journeys table. Cosmetic, yet it is the exact half-finished rename
  -- this migration exists to avoid.
  FOR r IN
    SELECT policyname AS conname, tablename AS relname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (policyname LIKE '%couple%' OR policyname LIKE '%profile%')
  LOOP
    newname := replace(replace(r.conname,  'couples',  'journeys'), 'couple',  'journey');
    newname := replace(replace(newname,    'profiles', 'members'),  'profile', 'member');
    EXECUTE format('ALTER POLICY %I ON public.%I RENAME TO %I',
                   r.conname, r.relname, newname);
    RAISE NOTICE 'policy %.% -> %', r.relname, r.conname, newname;
  END LOOP;
END $$;

COMMIT;

-- ---------------------------------------------------------------------------
-- 7. Verification. Read-only; safe to re-run.
-- ---------------------------------------------------------------------------

-- Expect: journeys, members — and no couples/profiles.
SELECT tablename FROM pg_tables
WHERE schemaname = 'public' AND tablename IN ('journeys','members','couples','profiles')
ORDER BY tablename;

-- Expect: zero rows. Any hit is a leftover reference to the old vocabulary.
SELECT c.relname AS table_name, a.attname AS column_name
FROM pg_attribute a
JOIN pg_class     c ON c.oid = a.attrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped
  AND a.attname IN ('couple_id','profile_id')
ORDER BY 1, 2;

-- Expect: create_journey_with_member, join_journey_by_code, my_journey_id,
-- my_member_id, reminders_due — and none of the old names.
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('create_journey_with_member','join_journey_by_code',
                    'my_journey_id','my_member_id','reminders_due',
                    'create_couple_with_profile','join_couple_by_code',
                    'my_couple_id','my_profile_id')
ORDER BY p.proname;

-- Expect: every policy still present, none referencing the old helper names.
SELECT tablename, policyname FROM pg_policies
WHERE schemaname = 'public' ORDER BY tablename, policyname;
