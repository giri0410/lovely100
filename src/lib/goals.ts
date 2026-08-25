/**
 * Goals and logs — the shape that replaces the four hardcoded habits.
 *
 * `cadence` and `metric` are two independent axes rather than one `type` enum,
 * because a single enum cannot express "walk 3x/week, 30 minutes each" — that
 * is weekly *and* quantified. The useful combinations:
 *
 *   daily  + bool                              "walk every day"
 *   daily  + number + targetPerPeriod 30       "walk 30 minutes a day"
 *   weekly + bool   + targetPerPeriod 3        "walk 3x a week"
 *   open   + bool   + targetTotal 10           "visit 10 places"
 */

export type Cadence = "daily" | "weekly" | "open";
export type Metric = "bool" | "number";

export interface Goal {
  id: string;
  journey_id: string;
  /** NULL means the goal belongs to the journey, and both members log it. */
  owner_member_id: string | null;
  category: string;
  title: string;
  icon: string | null;
  color: string | null;
  cadence: Cadence;
  metric: Metric;
  unit: string | null;
  /** Per day for daily goals, per week for weekly. NULL = just show up. */
  target_per_period: number | null;
  /** Open goals only. */
  target_total: number | null;
  /**
   * The day this goal starts counting. Mandatory: without it a goal added on
   * day 40 reports 39 retroactive misses and every percentage becomes a lie.
   */
  starts_on: string;
  sort_order: number;
  /** Archived rather than deleted — 60 kept days stay part of the story. */
  archived_at: string | null;
}

export interface Log {
  id: string;
  journey_id: string;
  member_id: string;
  /** NULL means this is a memory, attached to no goal. */
  goal_id: string | null;
  date: string;
  occurred_at: string;
  /**
   * Server-derived uniqueness key: the date for dated goals, NULL for open
   * goals and memories. Never sent by the client — the trigger assigns it.
   */
  slot: string | null;
  done: boolean;
  amount: number | null;
  note: string | null;
  place: string | null;
}

export interface GoalTemplate {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  category: string;
  icon: string | null;
  sort_order: number;
  goals: TemplateGoal[];
}

/** One goal shape inside a template's `goals` JSON array. */
export interface TemplateGoal {
  title: string;
  icon?: string;
  category?: string;
  cadence?: Cadence;
  metric?: Metric;
  unit?: string;
  target_per_period?: number;
  target_total?: number;
}

/* ---------- categories ---------- */

/**
 * Display metadata for the categories the templates ship with. Deliberately
 * not an enum and not a constraint: `category` is free text in the database
 * because this taxonomy will churn. Anything unrecognised falls back to
 * `OTHER_CATEGORY` rather than breaking a screen.
 */
export const CATEGORIES: Record<string, { label: string; emoji: string }> = {
  health: { label: "Health", emoji: "🌱" },
  cooking: { label: "Cooking & food", emoji: "🍳" },
  travel: { label: "Places", emoji: "✈️" },
  memories: { label: "Memories", emoji: "📷" },
  learning: { label: "Learning", emoji: "📘" },
  money: { label: "Money", emoji: "💸" },
  other: { label: "Other", emoji: "⭐" },
};

export const OTHER_CATEGORY = { label: "Other", emoji: "⭐" };

export function categoryMeta(category: string) {
  return CATEGORIES[category] ?? OTHER_CATEGORY;
}

/* ---------- goal helpers ---------- */

export function isActive(goal: Goal, on?: string): boolean {
  if (goal.archived_at) return false;
  return on === undefined ? true : goal.starts_on <= on;
}

/** Goals a member should see as theirs: journey-wide plus their own. */
export function goalsForMember(goals: Goal[], memberId: string): Goal[] {
  return goals.filter((g) => g.owner_member_id === null || g.owner_member_id === memberId);
}

/**
 * Whether a single log satisfies its goal for its period.
 *
 * A quantified goal with a target is only met when the amount reaches it —
 * logging 10 minutes against a 30-minute goal is progress, not completion.
 * A goal with no target is met by the log existing.
 */
export function logMeetsTarget(goal: Goal, log: Log): boolean {
  if (!log.done) return false;
  if (goal.metric === "number" && goal.target_per_period !== null) {
    return (log.amount ?? 0) >= goal.target_per_period;
  }
  return true;
}

/** Human label for a goal's target, or null when it has none. */
export function targetLabel(goal: Goal): string | null {
  const unit = goal.unit ?? "";
  if (goal.cadence === "open" && goal.target_total !== null) {
    return `${goal.target_total}${unit ? ` ${unit}` : ""} total`;
  }
  if (goal.target_per_period === null) return null;
  const per = goal.cadence === "weekly" ? "week" : "day";
  if (goal.metric === "number") {
    return `${goal.target_per_period}${unit ? ` ${unit}` : ""} a ${per}`;
  }
  return goal.target_per_period === 1
    ? `once a ${per}`
    : `${goal.target_per_period}x a ${per}`;
}

/* ---------- template parsing ---------- */

const CADENCES: Cadence[] = ["daily", "weekly", "open"];
const METRICS: Metric[] = ["bool", "number"];

function asPositiveInt(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : undefined;
}

/**
 * Turn a template's `goals` jsonb into TemplateGoal[].
 *
 * The column is arbitrary JSON as far as the database is concerned — only a
 * `jsonb_typeof = 'array'` CHECK guards it — so this validates rather than
 * casts. Entries without a usable title are dropped instead of becoming goals
 * called "undefined", and an unrecognised cadence or metric falls back to the
 * default rather than reaching a CHECK constraint as a failed insert.
 */
export function parseTemplateGoals(raw: unknown): TemplateGoal[] {
  if (!Array.isArray(raw)) return [];
  const out: TemplateGoal[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    const title = typeof o["title"] === "string" ? o["title"].trim() : "";
    if (!title) continue;

    const cadence = CADENCES.includes(o["cadence"] as Cadence) ? (o["cadence"] as Cadence) : "daily";
    const metric = METRICS.includes(o["metric"] as Metric) ? (o["metric"] as Metric) : "bool";

    const goal: TemplateGoal = { title, cadence, metric };
    if (typeof o["icon"] === "string") goal.icon = o["icon"];
    if (typeof o["category"] === "string") goal.category = o["category"];
    // A unit only means anything on a quantified goal — the DB enforces this.
    if (typeof o["unit"] === "string" && metric === "number") goal.unit = o["unit"];

    const perPeriod = asPositiveInt(o["target_per_period"]);
    const total = asPositiveInt(o["target_total"]);
    // Targets must match the cadence, or the insert trips a CHECK constraint.
    if (perPeriod !== undefined && cadence !== "open") goal.target_per_period = perPeriod;
    if (total !== undefined && cadence === "open") goal.target_total = total;

    out.push(goal);
  }
  return out;
}
