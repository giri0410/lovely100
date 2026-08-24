-- Fixes a bug introduced by 20260824000000: that migration started passing
-- NULL for an empty relationship label, but profiles.relationship is NOT NULL
-- DEFAULT 'partner', so creating a journey without filling the field failed
-- with a constraint violation.
--
-- Nullable is the correct model rather than a workaround. The field is now
-- optional in the UI and genuinely optional in meaning: someone doing their
-- 100 days alone has no relationship to describe, and inventing "partner" for
-- them was exactly the couples-only assumption this pivot is removing.

BEGIN;

ALTER TABLE public.profiles
  ALTER COLUMN relationship DROP NOT NULL;

-- Drop the default too — 'partner' is a guess, and a guess stored as data is
-- worse than an absent value the UI can simply not render.
ALTER TABLE public.profiles
  ALTER COLUMN relationship DROP DEFAULT;

COMMIT;
