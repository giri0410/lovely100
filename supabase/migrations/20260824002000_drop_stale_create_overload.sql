-- Removes the 3-argument create_couple_with_profile left behind by
-- 20260824000000.
--
-- That migration added a _kind parameter using CREATE OR REPLACE FUNCTION.
-- Changing the argument count makes Postgres create a NEW function rather than
-- replace the old one, so both signatures existed at once:
--
--   create_couple_with_profile(text, text, text)
--   create_couple_with_profile(text, text, text, text DEFAULT 'solo')
--
-- A 3-argument call then matches both candidates and PostgREST refuses to
-- choose, failing onboarding outright with PGRST203 rather than falling back:
--
--   Could not choose the best candidate function between: ...
--
-- Existing accounts were unaffected — this function only runs when a brand new
-- user creates their journey — but no new account could be created at all.
--
-- What restored onboarding was shipping the 4-argument frontend: that call has
-- only ever had one candidate, and it was verified working against production
-- (real signup -> journey created -> read back under RLS) before this migration
-- was applied. So this is cleanup, and it is safe to run at any time now.
--
-- With one candidate left, a stray 3-argument call should also resolve, since
-- _kind carries a DEFAULT — but that was not tested, so nothing here relies on
-- it. The frontend sends four arguments.

BEGIN;

DROP FUNCTION IF EXISTS public.create_couple_with_profile(text, text, text);

COMMIT;
