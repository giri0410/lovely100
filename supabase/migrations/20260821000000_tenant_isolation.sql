-- Phase 0: collapse RLS to a single rule — you can see your own couple, and
-- nothing else.
--
-- Before this, two policies carried escape hatches that made sense when the app
-- had one couple and a claimable demo, and leak across tenants once it is
-- public:
--
--   profiles_select ... OR auth_user_id IS NULL
--     A user with no profile of their own has my_couple_id() = NULL, so this
--     clause was the only one that matched — and it matched EVERY unclaimed
--     profile in the database. Onboarding then listed them as "Continue as
--     <name>" buttons, exposing member names from unrelated couples. Any admin
--     deletion produced another one, because deleteUser detaches the profile
--     to preserve the couple's history.
--
--   couples_select ... OR is_demo
--     Made the demo couple readable by everyone. No longer needed: the demo is
--     becoming a read-only tour served from the client-side mock fixtures, so
--     it does not need to exist in the database at all.
--
-- Verified before writing this: a stranger could list those profiles but could
-- NOT claim one (the WITH CHECK rejected it) and could not read another
-- couple's rows. So this closes an information leak, not an active breach.

BEGIN;

-- 1. The demo couple moves out of the database. Cascades to its profiles,
--    habits and expenses.
DELETE FROM public.couples WHERE is_demo = true;

-- 2. profiles: scoped strictly to your own couple / your own row.
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated
  USING (couple_id = public.my_couple_id());

DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth_user_id = auth.uid());

DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- 3. couples: same treatment, minus the is_demo exception.
DROP POLICY IF EXISTS "couples_select" ON public.couples;
CREATE POLICY "couples_select" ON public.couples FOR SELECT TO authenticated
  USING (id = public.my_couple_id());

DROP POLICY IF EXISTS "couples_update" ON public.couples;
CREATE POLICY "couples_update" ON public.couples FOR UPDATE TO authenticated
  USING (id = public.my_couple_id())
  WITH CHECK (id = public.my_couple_id());

-- couples_insert stays as it was: any authenticated user may create a couple,
-- but never one flagged as a demo.

COMMIT;

-- Notes on what deliberately did NOT change:
--
-- * A profile whose auth_user_id is NULL is still visible to the rest of its
--   own couple, via couple_id = my_couple_id(). That is intentional — when a
--   partner leaves, the couple's shared history should survive and stay
--   readable by the person who stayed.
--
-- * create_couple_with_profile() and join_couple_by_code() are SECURITY
--   DEFINER, so they bypass these policies and keep working unchanged. They are
--   also the reason the tightened profiles_insert is safe: the app never
--   inserts a profile directly.
