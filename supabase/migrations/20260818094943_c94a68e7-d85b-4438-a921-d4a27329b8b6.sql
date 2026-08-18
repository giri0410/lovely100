
CREATE TABLE public.couples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  start_date date NOT NULL DEFAULT current_date,
  duration integer NOT NULL DEFAULT 100,
  invite_code text NOT NULL UNIQUE DEFAULT upper(substr(md5(random()::text), 1, 6)),
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid UNIQUE,
  couple_id uuid NOT NULL REFERENCES public.couples(id) ON DELETE CASCADE,
  name text NOT NULL,
  relationship text NOT NULL DEFAULT 'partner',
  avatar text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.daily_habits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id uuid NOT NULL REFERENCES public.couples(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date date NOT NULL,
  walk_completed boolean NOT NULL DEFAULT false,
  walk_duration integer,
  healthy_food_completed boolean NOT NULL DEFAULT false,
  unnecessary_spending_completed boolean NOT NULL DEFAULT false,
  certification_completed boolean NOT NULL DEFAULT false,
  certification_minutes integer,
  certification_topic text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, date)
);

CREATE TABLE public.avoided_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id uuid NOT NULL REFERENCES public.couples(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT current_date,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  description text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.weekly_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id uuid NOT NULL REFERENCES public.couples(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  week_number integer NOT NULL,
  what_went_well text,
  what_to_improve text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, week_number)
);

CREATE TABLE public.reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reminder_type text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  reminder_time time NOT NULL DEFAULT '07:00',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, reminder_type)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.couples TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_habits TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.avoided_expenses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_reviews TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reminders TO authenticated;
GRANT ALL ON public.couples, public.profiles, public.daily_habits, public.avoided_expenses, public.weekly_reviews, public.reminders TO service_role;

CREATE OR REPLACE FUNCTION public.my_couple_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT couple_id FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.my_profile_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

ALTER TABLE public.couples ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avoided_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "couples_select" ON public.couples FOR SELECT TO authenticated
  USING (id = public.my_couple_id() OR is_demo);
CREATE POLICY "couples_insert" ON public.couples FOR INSERT TO authenticated WITH CHECK (NOT is_demo);
CREATE POLICY "couples_update" ON public.couples FOR UPDATE TO authenticated
  USING (id = public.my_couple_id() AND NOT is_demo) WITH CHECK (id = public.my_couple_id());

CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated
  USING (couple_id = public.my_couple_id() OR auth_user_id IS NULL);
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth_user_id = auth.uid() OR (auth_user_id IS NULL AND couple_id = public.my_couple_id()));
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid() OR auth_user_id IS NULL)
  WITH CHECK (auth_user_id = auth.uid() OR auth_user_id IS NULL);

CREATE POLICY "habits_select" ON public.daily_habits FOR SELECT TO authenticated
  USING (couple_id = public.my_couple_id());
CREATE POLICY "habits_write" ON public.daily_habits FOR INSERT TO authenticated
  WITH CHECK (profile_id = public.my_profile_id());
CREATE POLICY "habits_update" ON public.daily_habits FOR UPDATE TO authenticated
  USING (profile_id = public.my_profile_id()) WITH CHECK (profile_id = public.my_profile_id());
CREATE POLICY "habits_delete" ON public.daily_habits FOR DELETE TO authenticated
  USING (profile_id = public.my_profile_id());

CREATE POLICY "expenses_select" ON public.avoided_expenses FOR SELECT TO authenticated
  USING (couple_id = public.my_couple_id());
CREATE POLICY "expenses_insert" ON public.avoided_expenses FOR INSERT TO authenticated
  WITH CHECK (profile_id = public.my_profile_id());
CREATE POLICY "expenses_update" ON public.avoided_expenses FOR UPDATE TO authenticated
  USING (profile_id = public.my_profile_id()) WITH CHECK (profile_id = public.my_profile_id());
CREATE POLICY "expenses_delete" ON public.avoided_expenses FOR DELETE TO authenticated
  USING (profile_id = public.my_profile_id());

CREATE POLICY "reviews_select" ON public.weekly_reviews FOR SELECT TO authenticated
  USING (couple_id = public.my_couple_id());
CREATE POLICY "reviews_insert" ON public.weekly_reviews FOR INSERT TO authenticated
  WITH CHECK (profile_id = public.my_profile_id());
CREATE POLICY "reviews_update" ON public.weekly_reviews FOR UPDATE TO authenticated
  USING (profile_id = public.my_profile_id()) WITH CHECK (profile_id = public.my_profile_id());

CREATE POLICY "reminders_all" ON public.reminders FOR ALL TO authenticated
  USING (profile_id = public.my_profile_id()) WITH CHECK (profile_id = public.my_profile_id());

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER daily_habits_updated_at BEFORE UPDATE ON public.daily_habits
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Demo data
INSERT INTO public.couples (id, name, start_date, duration, invite_code, is_demo)
VALUES ('11111111-1111-1111-1111-111111111111', 'Alex & Priya', current_date - 9, 100, 'DEMO01', true);

INSERT INTO public.profiles (id, couple_id, name, relationship, avatar) VALUES
('22222222-2222-2222-2222-222222222221', '11111111-1111-1111-1111-111111111111', 'Alex', 'me', 'A'),
('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Priya', 'wife', 'P');

INSERT INTO public.daily_habits (couple_id, profile_id, date, walk_completed, walk_duration, healthy_food_completed, unnecessary_spending_completed, certification_completed, certification_minutes, certification_topic)
SELECT '11111111-1111-1111-1111-111111111111', p.id, current_date - g,
  (g % 7) <> 3,
  CASE WHEN (g % 4) = 1 THEN 25 ELSE 35 END,
  (g % 6) <> 2,
  (g % 5) <> 0,
  (g % 8) <> 4,
  CASE WHEN (g % 3) = 0 THEN 45 ELSE 30 END,
  CASE WHEN (g % 2) = 0 THEN 'Cloud fundamentals' ELSE 'Networking basics' END
FROM generate_series(1, 9) g
CROSS JOIN (VALUES ('22222222-2222-2222-2222-222222222221'::uuid), ('22222222-2222-2222-2222-222222222222'::uuid)) AS p(id);

INSERT INTO public.avoided_expenses (couple_id, profile_id, date, amount, description, reason) VALUES
('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222221', current_date - 8, 1200, 'Restaurant dinner', 'Cooked at home'),
('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222', current_date - 7, 899, 'Online sale kurta', 'Already have enough'),
('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222221', current_date - 5, 450, 'Cab to office', 'Walked instead'),
('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222', current_date - 3, 2300, 'New headphones', 'Current ones work fine'),
('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222221', current_date - 1, 620, 'Late night snacks order', 'Made poha at home');
