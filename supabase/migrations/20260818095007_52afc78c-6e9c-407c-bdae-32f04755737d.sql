
REVOKE EXECUTE ON FUNCTION public.my_couple_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.my_profile_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_couple_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_profile_id() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
