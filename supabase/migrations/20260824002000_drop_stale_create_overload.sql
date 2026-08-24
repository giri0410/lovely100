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
-- ORDER MATTERS: deploy the 4-argument frontend BEFORE running this. Until the
-- new code is live, dropping the old signature moves the failure from
-- "ambiguous" to "function not found" rather than fixing it. The 4-argument
-- call is unambiguous today, so shipping the frontend is what restores
-- onboarding; this migration then removes the trap for good.

BEGIN;

DROP FUNCTION IF EXISTS public.create_couple_with_profile(text, text, text);

COMMIT;
