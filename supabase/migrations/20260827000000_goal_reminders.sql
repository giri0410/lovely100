-- P5: reminders that know about goals.
--
-- The old model had four reminder types, two of them named after specific
-- habits ('walk', 'certification'). That cannot survive user-defined goals: a
-- reminder has to be able to point at any goal, or at none.
--
-- New shape for reminders.reminder_type:
--
--   'goal'   + goal_id  -> nudge for one specific goal
--   'daily'  + NULL     -> end-of-day digest of whatever is still open
--   'weekly' + NULL     -> the Sunday review nudge
--
--
-- WHY reminder_sends GAINS goal_id
--
-- Its unique key was (member_id, reminder_type, sent_for_date). With per-goal
-- reminders that collapses every goal reminder a member has into one send per
-- day: the first one recorded wins and the rest are silently treated as
-- already handled. goal_id has to be part of the key.
--
--
-- WHY PARTIAL INDEXES RATHER THAN ONE UNIQUE CONSTRAINT
--
-- Postgres treats NULLs as distinct, so a plain UNIQUE over a nullable goal_id
-- would let a member accumulate unlimited 'daily' reminders — exactly the
-- NULL-distinctness the logs.slot trigger exploits on purpose, here working
-- against us. Two partial indexes say what is actually meant: one row per
-- goal, and one row per non-goal reminder type.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. reminders
-- ---------------------------------------------------------------------------

ALTER TABLE public.reminders
  ADD COLUMN IF NOT EXISTS goal_id uuid REFERENCES public.goals(id) ON DELETE CASCADE;

-- The old constraint predates goal_id and is wrong for both cases now.
ALTER TABLE public.reminders
  DROP CONSTRAINT IF EXISTS reminders_member_id_reminder_type_key;

CREATE UNIQUE INDEX IF NOT EXISTS reminders_goal_key
  ON public.reminders (member_id, goal_id)
  WHERE goal_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS reminders_type_key
  ON public.reminders (member_id, reminder_type)
  WHERE goal_id IS NULL;

-- ---------------------------------------------------------------------------
-- 2. reminder_sends
-- ---------------------------------------------------------------------------

ALTER TABLE public.reminder_sends
  ADD COLUMN IF NOT EXISTS goal_id uuid REFERENCES public.goals(id) ON DELETE CASCADE;

ALTER TABLE public.reminder_sends
  DROP CONSTRAINT IF EXISTS reminder_sends_member_id_reminder_type_sent_for_date_key;

CREATE UNIQUE INDEX IF NOT EXISTS reminder_sends_goal_key
  ON public.reminder_sends (member_id, goal_id, sent_for_date)
  WHERE goal_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS reminder_sends_type_key
  ON public.reminder_sends (member_id, reminder_type, sent_for_date)
  WHERE goal_id IS NULL;

DROP INDEX IF EXISTS reminder_sends_lookup;
CREATE INDEX IF NOT EXISTS reminder_sends_lookup
  ON public.reminder_sends (member_id, sent_for_date);

COMMIT;

-- ---------------------------------------------------------------------------
-- 3. Migrate the existing rows.
--
-- 'walk' and 'certification' were habit-specific. Each becomes a 'goal'
-- reminder pointing at the goal of the matching title in that member's own
-- journey, keeping its configured time. Any that find no matching goal are
-- deleted rather than left dangling — a reminder for a habit that is no longer
-- a goal has nothing to say.
-- ---------------------------------------------------------------------------

BEGIN;

UPDATE public.reminders r
SET reminder_type = 'goal',
    goal_id = g.id
FROM public.members m, public.goals g
WHERE m.id = r.member_id
  AND g.journey_id = m.journey_id
  AND r.reminder_type = 'walk'
  AND g.title = 'Morning Walk';

UPDATE public.reminders r
SET reminder_type = 'goal',
    goal_id = g.id
FROM public.members m, public.goals g
WHERE m.id = r.member_id
  AND g.journey_id = m.journey_id
  AND r.reminder_type = 'certification'
  AND g.title = 'Certification';

DELETE FROM public.reminders WHERE reminder_type NOT IN ('goal', 'daily', 'weekly');

COMMIT;

-- ---------------------------------------------------------------------------
-- 4. Constraints last.
--
-- ORDER MATTERS: these run after the data migration above, not with the column
-- additions. Adding a CHECK for reminder_type IN ('goal','daily','weekly')
-- while rows still read 'walk' fails on the spot — the constraint is validated
-- against existing rows the moment it is added.
-- ---------------------------------------------------------------------------

BEGIN;

ALTER TABLE public.reminders
  DROP CONSTRAINT IF EXISTS reminders_type_check;
ALTER TABLE public.reminders
  ADD CONSTRAINT reminders_type_check CHECK (reminder_type IN ('goal', 'daily', 'weekly'));

-- A 'goal' reminder must name a goal; the other two must not.
ALTER TABLE public.reminders
  DROP CONSTRAINT IF EXISTS reminders_goal_id_shape_check;
ALTER TABLE public.reminders
  ADD CONSTRAINT reminders_goal_id_shape_check CHECK (
    (reminder_type = 'goal' AND goal_id IS NOT NULL)
    OR (reminder_type <> 'goal' AND goal_id IS NULL)
  );

COMMIT;

-- ---------------------------------------------------------------------------
-- 5. goal_met_on: one definition of "done" for SQL callers.
--
-- Mirrors logMeetsTarget in src/lib/goals.ts. A quantified goal with a target
-- is only met when the amount reaches it — ten minutes against a thirty-minute
-- goal is progress, not a finished day — and a goal with no target is met by a
-- log existing.
--
-- Named rather than inlined so the reminder query and anything added later
-- cannot quietly disagree about what counts.
-- ---------------------------------------------------------------------------

BEGIN;

CREATE OR REPLACE FUNCTION public.goal_met_on(_goal_id uuid, _member_id uuid, _date date)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.logs l
    JOIN public.goals g ON g.id = l.goal_id
    WHERE l.goal_id = _goal_id
      AND l.member_id = _member_id
      AND l.date = _date
      AND l.done
      AND (
        g.metric <> 'number'
        OR g.target_per_period IS NULL
        OR COALESCE(l.amount, 0) >= g.target_per_period
      )
  );
$$;

REVOKE ALL ON FUNCTION public.goal_met_on(uuid, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.goal_met_on(uuid, uuid, date) TO authenticated, service_role;

COMMIT;

-- ---------------------------------------------------------------------------
-- 6. reminders_due, rewritten.
--
-- Three things the old version got wrong, none of which a patch could fix:
--
--   done_count was four hardcoded booleans off daily_habits. It is now an
--   aggregate over whichever daily goals the member actually has, and the
--   titles still open come back as an array — which is what finally deletes
--   REMAINING_LABELS from the edge function and takes the count of duplicated
--   label lists in this codebase from five to zero.
--
--   The partner lookup was LEFT JOIN LATERAL ... LIMIT 1: it silently picked
--   the oldest other member and ignored the rest. Replaced with a real
--   aggregate over every other member, exposed as others_count and
--   others_all_done, which is all the copy ever needed — the email mentions
--   somebody else only to encourage, never to compare.
--
--   A 'goal' reminder now checks that its goal is actually running: started,
--   and not archived. Nagging about a goal that has not begun is worse than
--   silence.
--
-- What has NOT changed: the window arithmetic, including the _window_minutes
-- >= 1440 branch. Subtracting a whole day lands on the same wall-clock time,
-- so from_t = now_t and the normal branch would demand reminder_time be both
-- greater than and at most the same value. That fix stays as it was.
-- ---------------------------------------------------------------------------

BEGIN;

DROP FUNCTION IF EXISTS public.reminders_due(integer);

CREATE FUNCTION public.reminders_due(_window_minutes integer DEFAULT 5)
RETURNS TABLE (
  member_id uuid,
  member_name text,
  email text,
  reminder_type text,
  goal_id uuid,
  goal_title text,
  goal_unit text,
  goal_target integer,
  goal_done boolean,
  journey_name text,
  local_date date,
  day_number integer,
  week_number integer,
  goals_total integer,
  goals_done integer,
  open_titles text[],
  others_count integer,
  others_all_done boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH clock AS (
    SELECT
      (now() AT TIME ZONE 'Asia/Kolkata')::date AS local_date,
      (now() AT TIME ZONE 'Asia/Kolkata')::time AS now_t,
      ((now() AT TIME ZONE 'Asia/Kolkata') - make_interval(mins => _window_minutes))::time AS from_t
  ),
  -- Every member's daily-goal position for today: how many were running, how
  -- many are met, and which are still open.
  day_state AS (
    SELECT
      m.id AS member_id,
      count(g.id)::integer AS goals_total,
      count(g.id) FILTER (WHERE public.goal_met_on(g.id, m.id, k.local_date))::integer AS goals_done,
      COALESCE(
        array_agg(g.title ORDER BY g.sort_order)
          FILTER (WHERE NOT public.goal_met_on(g.id, m.id, k.local_date)),
        ARRAY[]::text[]
      ) AS open_titles
    FROM public.members m
    CROSS JOIN clock k
    LEFT JOIN public.goals g
           ON g.journey_id = m.journey_id
          AND (g.owner_member_id IS NULL OR g.owner_member_id = m.id)
          AND g.cadence = 'daily'
          AND g.archived_at IS NULL
          AND g.starts_on <= k.local_date
    GROUP BY m.id
  ),
  -- Every other member of the same journey, aggregated. No LIMIT 1.
  others AS (
    SELECT
      m.id AS member_id,
      count(o.id)::integer AS others_count,
      COALESCE(
        bool_and(os.goals_total > 0 AND os.goals_done >= os.goals_total)
          FILTER (WHERE o.id IS NOT NULL),
        false
      ) AS others_all_done
    FROM public.members m
    LEFT JOIN public.members o
           ON o.journey_id = m.journey_id AND o.id <> m.id
    LEFT JOIN day_state os ON os.member_id = o.id
    GROUP BY m.id
  )
  SELECT
    m.id,
    m.name,
    u.email::text,
    r.reminder_type,
    r.goal_id,
    g.title,
    g.unit,
    g.target_per_period,
    CASE WHEN r.goal_id IS NULL THEN NULL
         ELSE public.goal_met_on(r.goal_id, m.id, k.local_date) END,
    j.name,
    k.local_date,
    (k.local_date - j.start_date + 1)::integer,
    ceil((k.local_date - j.start_date + 1) / 7.0)::integer,
    ds.goals_total,
    ds.goals_done,
    ds.open_titles,
    ot.others_count,
    ot.others_all_done
  FROM public.reminders r
  JOIN public.members  m ON m.id = r.member_id
  JOIN public.journeys j ON j.id = m.journey_id
  JOIN auth.users      u ON u.id = m.auth_user_id
  CROSS JOIN clock k
  JOIN day_state ds ON ds.member_id = m.id
  JOIN others    ot ON ot.member_id = m.id
  -- Only for 'goal' reminders, and only while that goal is actually running.
  LEFT JOIN public.goals g
         ON g.id = r.goal_id
        AND g.archived_at IS NULL
        AND g.starts_on <= k.local_date
  LEFT JOIN public.reminder_sends s
         ON s.member_id = m.id
        AND s.sent_for_date = k.local_date
        AND (
          (r.goal_id IS NOT NULL AND s.goal_id = r.goal_id)
          OR (r.goal_id IS NULL AND s.goal_id IS NULL AND s.reminder_type = r.reminder_type)
        )
  WHERE r.enabled
    AND s.id IS NULL                       -- not already handled today
    AND u.email IS NOT NULL
    AND u.email_confirmed_at IS NOT NULL   -- never mail an unverified address
    AND k.local_date >= j.start_date       -- journey has started
    AND k.local_date < j.start_date + j.duration  -- and hasn't finished
    -- A goal reminder whose goal is archived, unstarted or deleted has nothing
    -- to say. The LEFT JOIN leaves g.id NULL in exactly those cases.
    AND (r.reminder_type <> 'goal' OR g.id IS NOT NULL)
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
