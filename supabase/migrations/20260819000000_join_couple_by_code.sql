-- Lets a signed-in user join an existing couple by invite code.
-- Needed because RLS on `couples` only allows reading a couple you already
-- belong to (or a demo couple) — a brand-new user has no couple yet, so a
-- plain client-side SELECT by invite_code would return nothing. This
-- function runs as its owner (SECURITY DEFINER) to look the couple up, then
-- inserts the caller's own profile row under normal privileges.
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
  VALUES (auth.uid(), target.id, _name, _relationship);

  RETURN target;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.join_couple_by_code(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_couple_by_code(text, text, text) TO authenticated;
