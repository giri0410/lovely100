-- Phase 1: make the reminders table actually do something.
--
-- Until now Settings persisted four reminder types with custom times and
-- nothing ever read the table. This adds the server side: a function that
-- reports which reminders are due right now, and a ledger so a reminder is
-- only ever handled once per day even if the scheduler overlaps or retries.
--
-- Delivery itself lives in the send-reminders Edge Function, not here. Two
-- reasons that matters: an Edge Function is reachable from a Capacitor WebView
-- (a TanStack server function is not), and keeping the schedule server-side
-- means swapping email for native push later touches one file.
--
-- Times are interpreted in Asia/Kolkata. That is a deliberate simplification
-- of the India-only decision — no per-user timezone column, no ambiguity.

BEGIN;

-- One row per reminder actually dealt with, per local day. The unique
-- constraint is the idempotency guarantee.
CREATE TABLE IF NOT EXISTS public.reminder_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reminder_type text NOT NULL,
  sent_for_date date NOT NULL,
  -- sent: an email went out. skipped: nothing worth saying (habit already
  -- done). failed: the provider rejected it; kept so it isn't retried in a loop.
  status text NOT NULL DEFAULT 'sent',
  detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, reminder_type, sent_for_date)
);

-- Only the scheduler touches this table; clients have no business reading it.
ALTER TABLE public.reminder_sends ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.reminder_sends TO service_role;

CREATE INDEX IF NOT EXISTS reminder_sends_lookup
  ON public.reminder_sends (profile_id, reminder_type, sent_for_date);

-- Everything the scheduler needs in one round trip: who is due, their email,
-- and how their day is going so the copy can be specific.
CREATE OR REPLACE FUNCTION public.reminders_due(_window_minutes integer DEFAULT 5)
RETURNS TABLE (
  profile_id uuid,
  profile_name text,
  email text,
  reminder_type text,
  couple_name text,
  local_date date,
  day_number integer,
  week_number integer,
  walk_done boolean,
  food_done boolean,
  spending_done boolean,
  cert_done boolean,
  done_count integer,
  partner_name text,
  partner_done_count integer
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
    p.id,
    p.name,
    u.email::text,
    r.reminder_type,
    c.name,
    k.local_date,
    (k.local_date - c.start_date + 1)::integer,
    ceil((k.local_date - c.start_date + 1) / 7.0)::integer,
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
    partner.name,
    COALESCE(
      (
        COALESCE(ph.walk_completed, false)::int
        + COALESCE(ph.healthy_food_completed, false)::int
        + COALESCE(ph.unnecessary_spending_completed, false)::int
        + COALESCE(ph.certification_completed, false)::int
      ),
      0
    )
  FROM public.reminders r
  JOIN public.profiles p  ON p.id = r.profile_id
  JOIN public.couples  c  ON c.id = p.couple_id
  JOIN auth.users      u  ON u.id = p.auth_user_id
  CROSS JOIN clock k
  LEFT JOIN public.daily_habits h ON h.profile_id = p.id AND h.date = k.local_date
  -- The other member of the couple, if there is one.
  LEFT JOIN public.profiles partner
         ON partner.couple_id = p.couple_id AND partner.id <> p.id
  LEFT JOIN public.daily_habits ph ON ph.profile_id = partner.id AND ph.date = k.local_date
  LEFT JOIN public.reminder_sends s
         ON s.profile_id = p.id
        AND s.reminder_type = r.reminder_type
        AND s.sent_for_date = k.local_date
  WHERE r.enabled
    AND s.id IS NULL                       -- not already handled today
    AND u.email IS NOT NULL
    AND u.email_confirmed_at IS NOT NULL   -- never mail an unverified address
    AND k.local_date >= c.start_date       -- challenge has started
    AND k.local_date < c.start_date + c.duration  -- and hasn't finished
    -- The configured time fell inside the window we're catching up on. The
    -- CASE handles a window that straddles midnight.
    AND CASE
          WHEN k.from_t <= k.now_t
            THEN r.reminder_time > k.from_t AND r.reminder_time <= k.now_t
          ELSE r.reminder_time > k.from_t OR  r.reminder_time <= k.now_t
        END
    -- The weekly review only makes sense on a Sunday.
    AND (r.reminder_type <> 'weekly' OR EXTRACT(dow FROM k.local_date) = 0)
$$;

REVOKE ALL ON FUNCTION public.reminders_due(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reminders_due(integer) TO service_role;

COMMIT;
