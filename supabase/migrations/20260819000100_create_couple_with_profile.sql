-- Atomically creates a couple plus the founding member's profile.
-- Needed because a brand-new couple's row can't be read back (RETURNING)
-- under normal RLS: couples_select requires my_couple_id(), which resolves
-- via the caller's own profile row — but that profile doesn't exist until
-- the second insert below runs. SECURITY DEFINER sidesteps that ordering
-- problem for this one self-serve action.
CREATE OR REPLACE FUNCTION public.create_couple_with_profile(_couple_name text, _profile_name text, _relationship text)
RETURNS public.couples
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_couple public.couples;
BEGIN
  INSERT INTO public.couples (name)
  VALUES (COALESCE(NULLIF(trim(_couple_name), ''), _profile_name || '''s challenge'))
  RETURNING * INTO new_couple;

  INSERT INTO public.profiles (auth_user_id, couple_id, name, relationship)
  VALUES (auth.uid(), new_couple.id, _profile_name, _relationship);

  RETURN new_couple;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_couple_with_profile(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_couple_with_profile(text, text, text) TO authenticated;
