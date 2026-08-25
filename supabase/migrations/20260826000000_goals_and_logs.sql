-- P2: user-defined goals, and one log table for entries and memories alike.
--
-- Until now the four habits were columns on daily_habits: walk_completed,
-- healthy_food_completed, unnecessary_spending_completed,
-- certification_completed. That shape can only ever express one couple's
-- health plan. This adds goals people define themselves, across any category.
--
-- daily_habits is deliberately LEFT IN PLACE and still written by the app.
-- P4 switches reads and writes over to logs; dropping the old table before
-- then would mean a schema with no working client. It is a backup until the
-- new path is proven, and its removal is a later, separate migration.
--
--
-- FOUR DESIGN DECISIONS
--
-- 1. cadence x metric, not one `type` enum. A single enum cannot express
--    "walk 3x/week, 30 minutes each" — weekly AND quantified. Two orthogonal
--    axes give every useful combination:
--      daily  + bool   + target_per_period NULL  -> "walk every day"
--      daily  + number + target_per_period 30    -> "walk 30 minutes a day"
--      weekly + bool   + target_per_period 3     -> "walk 3x a week"
--      open   + bool   + target_total 10         -> "visit 10 places"
--
-- 2. text + CHECK rather than native enums. journeys.kind already uses this,
--    and a CHECK is alterable in one statement whereas an enum cannot drop a
--    value at all and cannot gain one inside a transaction on older Postgres.
--    category is plain indexed text with no CHECK: that taxonomy will churn.
--
-- 3. One logs table, not entries + moments. A memory is simply a log with
--    goal_id IS NULL. This makes the "100 days of memories" feed one ordered
--    query rather than a UNION, gives one RLS policy pair and one media FK,
--    and lets a photo hang off a goal log — a picture of today's walk —
--    without inventing a second concept.
--
-- 4. goals.starts_on is mandatory. Without it a goal added on day 40 shows 39
--    retroactive misses and every percentage in the app becomes a lie.
--
--
-- WHERE THIS DEVIATES FROM THE PLAN, AND WHY
--
-- The plan specified slot = ISO date for daily, 'YYYY-Www' for weekly, NULL
-- for open. A week-key slot is wrong: combined with
-- UNIQUE (member_id, goal_id, slot) it permits exactly one log per week, which
-- directly contradicts target_per_period = 3 on a weekly goal. "Walk 3x a
-- week" would be unloggable after the first walk.
--
-- So slot is the date for BOTH daily and weekly, and NULL for open goals and
-- for memories. Cadence governs the progress arithmetic, not the shape of a
-- log. What the constraint then buys is still worth having: it stops the same
-- dated goal being logged twice on one day, which is what makes the existing
-- upsert-on-conflict pattern keep working unchanged.

BEGIN;

-- ---------------------------------------------------------------------------
-- goals
-- ---------------------------------------------------------------------------

CREATE TABLE public.goals (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id        uuid NOT NULL REFERENCES public.journeys(id) ON DELETE CASCADE,

  -- NULL means the goal belongs to the journey rather than one person: both
  -- members log against it and both see it as theirs.
  owner_member_id   uuid REFERENCES public.members(id) ON DELETE CASCADE,

  -- Free text on purpose. Health / cooking / travel / money / learning today,
  -- something else next month. Indexed for grouping, never constrained.
  category          text NOT NULL DEFAULT 'other',

  title             text NOT NULL,
  icon              text,
  color             text,

  cadence           text NOT NULL DEFAULT 'daily',
  metric            text NOT NULL DEFAULT 'bool',
  unit              text,

  -- Per day for daily goals, per week for weekly ones. NULL means the goal is
  -- satisfied by showing up at all.
  target_per_period integer,

  -- Open goals only: "visit 10 places" is 10 logs whenever they happen.
  target_total      integer,

  -- Mandatory. See decision 4 above.
  starts_on         date NOT NULL DEFAULT current_date,

  sort_order        integer NOT NULL DEFAULT 0,

  -- Archived rather than deleted: a goal someone kept for 60 days is part of
  -- their story even after they stop.
  archived_at       timestamptz,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT goals_cadence_check  CHECK (cadence IN ('daily', 'weekly', 'open')),
  CONSTRAINT goals_metric_check   CHECK (metric  IN ('bool', 'number')),
  CONSTRAINT goals_title_check    CHECK (length(trim(title)) > 0),

  -- Targets have to match the cadence they are expressed in, or the progress
  -- maths silently picks a denominator the user never set.
  CONSTRAINT goals_target_total_check
    CHECK (target_total IS NULL OR cadence = 'open'),
  CONSTRAINT goals_target_per_period_check
    CHECK (target_per_period IS NULL OR cadence IN ('daily', 'weekly')),
  CONSTRAINT goals_targets_positive_check
    CHECK (COALESCE(target_total, 1) > 0 AND COALESCE(target_per_period, 1) > 0),

  -- A unit only means something for a quantified goal.
  CONSTRAINT goals_unit_check
    CHECK (unit IS NULL OR metric = 'number')
);

CREATE INDEX goals_journey_idx  ON public.goals (journey_id, sort_order);
CREATE INDEX goals_category_idx ON public.goals (journey_id, category);
CREATE INDEX goals_active_idx   ON public.goals (journey_id) WHERE archived_at IS NULL;

-- ---------------------------------------------------------------------------
-- logs — goal entries and standalone memories in one table
-- ---------------------------------------------------------------------------

CREATE TABLE public.logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Denormalised from the member. Set by trigger, never trusted from the
  -- client: it is what every RLS policy and journey-wide query reads.
  journey_id  uuid NOT NULL REFERENCES public.journeys(id) ON DELETE CASCADE,
  member_id   uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,

  -- NULL = a memory attached to no goal.
  goal_id     uuid REFERENCES public.goals(id) ON DELETE CASCADE,

  date        date NOT NULL DEFAULT current_date,
  occurred_at timestamptz NOT NULL DEFAULT now(),

  -- Uniqueness key for dated goals; NULL for open goals and memories, and
  -- Postgres treats NULLs as distinct so those log freely. Trigger-assigned.
  slot        text,

  done        boolean NOT NULL DEFAULT true,
  amount      numeric(12,2),

  note        text,
  place       text,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT logs_amount_check CHECK (amount IS NULL OR amount >= 0)
);

-- One log per member per dated goal per day. Open goals and memories have a
-- NULL slot and are therefore unconstrained.
CREATE UNIQUE INDEX logs_slot_key ON public.logs (member_id, goal_id, slot);

CREATE INDEX logs_journey_date_idx ON public.logs (journey_id, date DESC);
CREATE INDEX logs_member_date_idx  ON public.logs (member_id, date DESC);
CREATE INDEX logs_goal_idx         ON public.logs (goal_id, date DESC);
-- The memories feed: newest first, goal-less only.
CREATE INDEX logs_memories_idx     ON public.logs (journey_id, occurred_at DESC)
  WHERE goal_id IS NULL;

COMMIT;

-- ---------------------------------------------------------------------------
-- The slot trigger
--
-- Both slot and journey_id are derived server-side rather than accepted from
-- the client. journey_id because every RLS policy reads it, and a client that
-- could set it freely could file its log under someone else's journey. slot
-- because it is the uniqueness key: a client that could choose its own slot
-- could log the same daily goal twenty times by varying it.
--
-- Runs on UPDATE too. Moving a log to a different date has to move its slot,
-- or the unique index stops matching reality.
-- ---------------------------------------------------------------------------

BEGIN;

CREATE OR REPLACE FUNCTION public.logs_set_derived()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  goal_cadence text;
  member_journey uuid;
BEGIN
  -- journey_id always comes from the member.
  SELECT journey_id INTO member_journey
  FROM public.members WHERE id = NEW.member_id;

  IF member_journey IS NULL THEN
    RAISE EXCEPTION 'member % does not exist', NEW.member_id;
  END IF;

  NEW.journey_id := member_journey;

  IF NEW.goal_id IS NULL THEN
    -- A memory. Unconstrained: log as many in a day as you like.
    NEW.slot := NULL;
  ELSE
    SELECT cadence INTO goal_cadence
    FROM public.goals
    WHERE id = NEW.goal_id AND journey_id = member_journey;

    -- Also the cross-journey check: a goal from another journey is invisible
    -- here, so this rejects it rather than silently filing the log.
    IF goal_cadence IS NULL THEN
      RAISE EXCEPTION 'goal % is not part of this journey', NEW.goal_id;
    END IF;

    -- Dated cadences are unique per day. Open goals are not: slot stays NULL
    -- and Postgres counts NULLs as distinct, so they accumulate.
    NEW.slot := CASE
                  WHEN goal_cadence IN ('daily', 'weekly') THEN NEW.date::text
                  ELSE NULL
                END;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER logs_set_derived_trg
  BEFORE INSERT OR UPDATE ON public.logs
  FOR EACH ROW EXECUTE FUNCTION public.logs_set_derived();

CREATE TRIGGER goals_updated_at
  BEFORE UPDATE ON public.goals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMIT;

-- ---------------------------------------------------------------------------
-- media — photos and clips hanging off a log
-- ---------------------------------------------------------------------------

BEGIN;

CREATE TABLE public.media (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  log_id       uuid NOT NULL REFERENCES public.logs(id) ON DELETE CASCADE,

  -- Path inside the storage bucket. The bucket itself and its RLS arrive in
  -- P6; this table exists now so a log has somewhere to point.
  storage_path text NOT NULL,
  mime         text,
  width        integer,
  height       integer,
  bytes        integer,
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT media_storage_path_key UNIQUE (storage_path)
);

CREATE INDEX media_log_idx ON public.media (log_id);

COMMIT;

-- ---------------------------------------------------------------------------
-- goal_templates — the starting points, as data
--
-- The original four live here as a row rather than as a HABITS array in
-- TypeScript. That is the whole point of the pivot: the four are one option
-- among many, and adding a template must not require a deploy.
-- ---------------------------------------------------------------------------

BEGIN;

CREATE TABLE public.goal_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  title       text NOT NULL,
  description text,
  category    text NOT NULL DEFAULT 'other',
  icon        text,
  sort_order  integer NOT NULL DEFAULT 0,
  -- Array of goal shapes: title, icon, category, cadence, metric, unit,
  -- target_per_period, target_total.
  goals       jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT goal_templates_goals_check CHECK (jsonb_typeof(goals) = 'array')
);

COMMIT;

-- ---------------------------------------------------------------------------
-- RLS
--
-- Same shape as the existing tables: read anything in your journey, write only
-- your own rows. Phase 0 established that pattern after a real leak, so it is
-- copied rather than reinvented.
--
-- goals differ in one deliberate way. A shared goal (owner_member_id IS NULL)
-- is editable by either member, because it belongs to the journey. A personal
-- goal is editable only by its owner. Both remain readable journey-wide, so
-- the other person can see what you are working on and cheer it on — that is
-- the entire point of a shared journey — but cannot rename or delete it.
-- ---------------------------------------------------------------------------

BEGIN;

ALTER TABLE public.goals          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_templates ENABLE ROW LEVEL SECURITY;

-- goals -------------------------------------------------------------------
CREATE POLICY "goals_select" ON public.goals FOR SELECT TO authenticated
  USING (journey_id = public.my_journey_id());

CREATE POLICY "goals_insert" ON public.goals FOR INSERT TO authenticated
  WITH CHECK (
    journey_id = public.my_journey_id()
    AND (owner_member_id IS NULL OR owner_member_id = public.my_member_id())
  );

CREATE POLICY "goals_update" ON public.goals FOR UPDATE TO authenticated
  USING (
    journey_id = public.my_journey_id()
    AND (owner_member_id IS NULL OR owner_member_id = public.my_member_id())
  )
  WITH CHECK (
    journey_id = public.my_journey_id()
    AND (owner_member_id IS NULL OR owner_member_id = public.my_member_id())
  );

CREATE POLICY "goals_delete" ON public.goals FOR DELETE TO authenticated
  USING (
    journey_id = public.my_journey_id()
    AND (owner_member_id IS NULL OR owner_member_id = public.my_member_id())
  );

-- logs --------------------------------------------------------------------
-- journey_id is trigger-assigned, so the INSERT check reads member_id: it is
-- the column the client actually controls.
CREATE POLICY "logs_select" ON public.logs FOR SELECT TO authenticated
  USING (journey_id = public.my_journey_id());

CREATE POLICY "logs_insert" ON public.logs FOR INSERT TO authenticated
  WITH CHECK (member_id = public.my_member_id());

CREATE POLICY "logs_update" ON public.logs FOR UPDATE TO authenticated
  USING (member_id = public.my_member_id())
  WITH CHECK (member_id = public.my_member_id());

CREATE POLICY "logs_delete" ON public.logs FOR DELETE TO authenticated
  USING (member_id = public.my_member_id());

-- media -------------------------------------------------------------------
-- Reachable only through a log, so every policy resolves via that log.
CREATE POLICY "media_select" ON public.media FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.logs l
    WHERE l.id = media.log_id AND l.journey_id = public.my_journey_id()
  ));

CREATE POLICY "media_insert" ON public.media FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.logs l
    WHERE l.id = media.log_id AND l.member_id = public.my_member_id()
  ));

CREATE POLICY "media_delete" ON public.media FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.logs l
    WHERE l.id = media.log_id AND l.member_id = public.my_member_id()
  ));

-- goal_templates ----------------------------------------------------------
-- Reference data. Readable by any signed-in user, writable by nobody through
-- the API — new templates arrive by migration.
CREATE POLICY "goal_templates_select" ON public.goal_templates FOR SELECT TO authenticated
  USING (true);

-- Grants ------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.logs  TO authenticated;
GRANT SELECT, INSERT,         DELETE ON public.media TO authenticated;
GRANT SELECT                         ON public.goal_templates TO authenticated;

GRANT ALL ON public.goals, public.logs, public.media, public.goal_templates
  TO service_role;

-- The trigger function is SECURITY DEFINER and must not be callable directly.
REVOKE ALL ON FUNCTION public.logs_set_derived() FROM PUBLIC, anon, authenticated;

COMMIT;

-- ---------------------------------------------------------------------------
-- Templates, including the original four
-- ---------------------------------------------------------------------------

BEGIN;

INSERT INTO public.goal_templates (slug, title, description, category, icon, sort_order, goals) VALUES
('original-four',
 'Health & discipline',
 'The original Lovely 100 set: a walk, clean eating, no wasteful spending, and daily study.',
 'health', '🌱', 10,
 '[
   {"title":"Morning Walk","icon":"🚶","category":"health","cadence":"daily","metric":"number","unit":"minutes","target_per_period":30},
   {"title":"Healthy Food","icon":"🥗","category":"health","cadence":"daily","metric":"bool"},
   {"title":"No Unnecessary Spending","icon":"💸","category":"money","cadence":"daily","metric":"bool"},
   {"title":"Certification","icon":"📘","category":"learning","cadence":"daily","metric":"number","unit":"minutes","target_per_period":30}
 ]'::jsonb),

('cooking',
 'Cooking & food',
 'Cook more, order less, and work through the recipes you keep meaning to try.',
 'cooking', '🍳', 20,
 '[
   {"title":"Cook at home","icon":"🍳","category":"cooking","cadence":"daily","metric":"bool"},
   {"title":"Try a new recipe","icon":"📖","category":"cooking","cadence":"weekly","metric":"bool","target_per_period":1},
   {"title":"Recipes to try","icon":"⭐","category":"cooking","cadence":"open","metric":"bool","target_total":20}
 ]'::jsonb),

('places',
 'Places & memories',
 'Trips, small outings, and the days worth keeping.',
 'travel', '✈️', 30,
 '[
   {"title":"Places to visit","icon":"📍","category":"travel","cadence":"open","metric":"bool","target_total":10},
   {"title":"Go somewhere new","icon":"🗺️","category":"travel","cadence":"weekly","metric":"bool","target_per_period":1},
   {"title":"Photo of the day","icon":"📷","category":"memories","cadence":"daily","metric":"bool"}
 ]'::jsonb),

('movement',
 'Sport & movement',
 'Whatever moving well looks like for you.',
 'health', '🏃', 40,
 '[
   {"title":"Workout","icon":"🏋️","category":"health","cadence":"weekly","metric":"bool","target_per_period":3},
   {"title":"Steps","icon":"👟","category":"health","cadence":"daily","metric":"number","unit":"steps","target_per_period":8000},
   {"title":"Sleep by 11pm","icon":"😴","category":"health","cadence":"daily","metric":"bool"}
 ]'::jsonb),

('learning',
 'Learning & money',
 'Study a little every day, and track what you chose not to spend.',
 'learning', '📘', 50,
 '[
   {"title":"Study","icon":"📘","category":"learning","cadence":"daily","metric":"number","unit":"minutes","target_per_period":30},
   {"title":"Read","icon":"📚","category":"learning","cadence":"daily","metric":"number","unit":"pages","target_per_period":10},
   {"title":"No impulse buys","icon":"💸","category":"money","cadence":"daily","metric":"bool"}
 ]'::jsonb);

COMMIT;

-- ---------------------------------------------------------------------------
-- Backfill: existing journeys get the original four, and every daily_habits
-- row fans out into logs.
--
-- Ordering matters. Goals are created with starts_on = the journey's own
-- start_date, not today, or every existing journey would show its whole
-- history as missed.
--
-- Only completed habits become logs. A false column means "not done", and
-- writing a log with done = false for it would turn 96 unremarkable days into
-- 96 rows asserting failure. Absence already means not done everywhere else in
-- this schema.
--
-- The unique index makes this idempotent: re-running inserts nothing new.
-- ---------------------------------------------------------------------------

BEGIN;

-- 1. Give every existing journey the original four, preserving their order.
INSERT INTO public.goals
  (journey_id, category, title, icon, cadence, metric, unit, target_per_period, starts_on, sort_order)
SELECT
  j.id,
  g.category,
  g.title,
  g.icon,
  'daily',
  g.metric,
  g.unit,
  g.target_per_period,
  j.start_date,          -- the journey's own start, never current_date
  g.sort_order
FROM public.journeys j
CROSS JOIN (
  VALUES
    ('health',   'Morning Walk',            '🚶', 'number', 'minutes', 30, 1),
    ('health',   'Healthy Food',            '🥗', 'bool',   NULL,    NULL, 2),
    ('money',    'No Unnecessary Spending', '💸', 'bool',   NULL,    NULL, 3),
    ('learning', 'Certification',           '📘', 'number', 'minutes', 30, 4)
) AS g(category, title, icon, metric, unit, target_per_period, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.goals existing
  WHERE existing.journey_id = j.id AND existing.title = g.title
);

-- 2. Fan each daily_habits row into up to four goal logs.
--    slot and journey_id are assigned by the trigger.
INSERT INTO public.logs (member_id, goal_id, date, occurred_at, done, amount, note)
SELECT
  h.member_id,
  g.id,
  h.date,
  h.created_at,
  true,
  src.amount,
  src.note
FROM public.daily_habits h
JOIN public.members m ON m.id = h.member_id
CROSS JOIN LATERAL (
  VALUES
    ('Morning Walk',            h.walk_completed,                 h.walk_duration::numeric,        NULL::text),
    ('Healthy Food',            h.healthy_food_completed,         NULL::numeric,                   NULL::text),
    ('No Unnecessary Spending', h.unnecessary_spending_completed, NULL::numeric,                   NULL::text),
    ('Certification',           h.certification_completed,        h.certification_minutes::numeric, h.certification_topic)
) AS src(title, completed, amount, note)
JOIN public.goals g
  ON g.journey_id = m.journey_id AND g.title = src.title
WHERE src.completed
ON CONFLICT DO NOTHING;

-- 3. Notes were free text about the day, not about any one habit, so they
--    survive as goal-less logs — which is exactly what a memory is. Dropping
--    them would lose the only prose anyone has written in this app.
INSERT INTO public.logs (member_id, goal_id, date, occurred_at, done, note)
SELECT h.member_id, NULL, h.date, h.created_at, true, h.notes
FROM public.daily_habits h
WHERE h.notes IS NOT NULL AND length(trim(h.notes)) > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.logs l
    WHERE l.member_id = h.member_id AND l.goal_id IS NULL
      AND l.date = h.date AND l.note = h.notes
  );

COMMIT;

-- ---------------------------------------------------------------------------
-- Verification. Read-only, safe to re-run.
-- ---------------------------------------------------------------------------

-- Every journey should have exactly 4 goals, each starting on the journey's
-- own start_date.
SELECT j.name, j.start_date, count(g.id) AS goals,
       min(g.starts_on) AS earliest_goal_start,
       (min(g.starts_on) = j.start_date) AS starts_on_correct
FROM public.journeys j
LEFT JOIN public.goals g ON g.journey_id = j.id
GROUP BY j.id, j.name, j.start_date
ORDER BY j.name;

-- The row-count proof: completed habit checkboxes in, goal logs out. These two
-- numbers must match exactly.
SELECT
  (SELECT count(*) FROM public.daily_habits h
   CROSS JOIN LATERAL (VALUES
     (h.walk_completed), (h.healthy_food_completed),
     (h.unnecessary_spending_completed), (h.certification_completed)
   ) AS v(done) WHERE v.done)                              AS completed_checkboxes,
  (SELECT count(*) FROM public.logs WHERE goal_id IS NOT NULL) AS goal_logs,
  (SELECT count(*) FROM public.daily_habits
   WHERE notes IS NOT NULL AND length(trim(notes)) > 0)    AS habit_notes,
  (SELECT count(*) FROM public.logs WHERE goal_id IS NULL)    AS memory_logs;

-- Expect 0. Every goal log must carry the slot the trigger derives, and its
-- journey must match its member's.
SELECT count(*) AS logs_with_bad_slot
FROM public.logs l
JOIN public.goals g ON g.id = l.goal_id
WHERE (g.cadence IN ('daily','weekly') AND l.slot IS DISTINCT FROM l.date::text)
   OR (g.cadence = 'open' AND l.slot IS NOT NULL);

SELECT count(*) AS logs_with_wrong_journey
FROM public.logs l
JOIN public.members m ON m.id = l.member_id
WHERE l.journey_id <> m.journey_id;

-- Expect 5 templates, original-four among them with 4 goals in its array.
SELECT slug, title, jsonb_array_length(goals) AS goal_count
FROM public.goal_templates ORDER BY sort_order;

-- Sanity: what the walk/certification amounts carried over as.
SELECT g.title, l.date, l.amount, l.note
FROM public.logs l JOIN public.goals g ON g.id = l.goal_id
WHERE l.amount IS NOT NULL OR l.note IS NOT NULL
ORDER BY l.date, g.title;
