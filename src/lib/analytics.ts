/**
 * Derived series for the analytics screen.
 *
 * Pure functions over what buildProgress already computed, kept separate so the
 * charts have no logic of their own to get wrong — and so every number on that
 * screen is testable without rendering anything.
 *
 * The honesty rules from progress.ts carry over unchanged: a percentage exists
 * only where a real denominator does, an untouched today is not a miss, and
 * nothing is ever inferred from a missing value.
 */

import { parseISO, weekNumberForDay, dayNumber } from "./challenge";
import { goalActiveOn, type JourneyProgress, type MemberProgress } from "./progress";
import { categoryMeta, logMeetsTarget, type Goal, type Log } from "./goals";

/* ---------- consistency over time ---------- */

export interface WeekPoint {
  week: number;
  label: string;
  /** Days in this week that carried at least one log. */
  daysShownUp: number;
  /** Days of this week that have actually elapsed — never more. */
  daysElapsed: number;
  pct: number | null;
  /** False for the week in progress, so the UI can mark it as partial. */
  complete: boolean;
}

/**
 * Show-up rate per journey week.
 *
 * Weeks are journey-relative (week 1 is days 1–7), matching the review screen
 * and how someone counting their own hundred days thinks. The current week is
 * included but flagged incomplete rather than dropped — hiding it would make
 * the chart look like it stops days before today.
 */
export function weeklyShowUp(progress: JourneyProgress, memberId: string): WeekPoint[] {
  const mine = progress.members.find((m) => m.member.id === memberId);
  if (!mine) return [];

  const logged = new Set(mine.loggedDates);
  const byWeek = new Map<number, { up: number; elapsed: number }>();

  for (const date of progress.dates) {
    if (date > progress.today) break;
    const w = weekNumberForDay(dayNumber(progress.dates[0]!, date));
    const cur = byWeek.get(w) ?? { up: 0, elapsed: 0 };
    cur.elapsed += 1;
    if (logged.has(date)) cur.up += 1;
    byWeek.set(w, cur);
  }

  return [...byWeek.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([week, v]) => ({
      week,
      label: `W${week}`,
      daysShownUp: v.up,
      daysElapsed: v.elapsed,
      pct: v.elapsed > 0 ? Math.round((v.up / v.elapsed) * 100) : null,
      complete: v.elapsed === 7,
    }));
}

/* ---------- per-goal ---------- */

export interface GoalBar {
  goalId: string;
  title: string;
  icon: string | null;
  category: string;
  /** Present only where the goal defines a denominator. */
  pct: number | null;
  done: number;
  target: number | null;
  cadence: Goal["cadence"];
}

/** Goals sorted by how well they are going, so the weak ones are easy to find. */
export function goalBars(member: MemberProgress): GoalBar[] {
  return member.goals
    .filter((g) => !g.goal.archived_at)
    .map((g) => ({
      goalId: g.goal.id,
      title: g.goal.title,
      icon: g.goal.icon,
      category: g.goal.category,
      pct: g.pct,
      done: g.unitsDone,
      target: g.target,
      cadence: g.goal.cadence,
    }))
    // Goals with a percentage sort by it; the rest fall below, by count.
    .sort((a, b) => {
      if (a.pct !== null && b.pct !== null) return b.pct - a.pct;
      if (a.pct !== null) return -1;
      if (b.pct !== null) return 1;
      return b.done - a.done;
    });
}

/* ---------- day-of-week pattern ---------- */

export interface DayPoint {
  dow: number;
  label: string;
  shownUp: number;
  occurrences: number;
  pct: number | null;
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Which weekdays actually get logged.
 *
 * The denominator is how many of that weekday have elapsed, not seven — on day
 * ten of a journey some weekdays have come round twice and others once, and
 * dividing them all by the same number would invent a pattern.
 */
export function dayOfWeekPattern(progress: JourneyProgress, memberId: string): DayPoint[] {
  const mine = progress.members.find((m) => m.member.id === memberId);
  const logged = new Set(mine?.loggedDates ?? []);
  const counts = DOW.map((label, dow) => ({ dow, label, shownUp: 0, occurrences: 0 }));

  for (const date of progress.dates) {
    if (date > progress.today) break;
    const d = parseISO(date).getDay();
    const slot = counts[d]!;
    slot.occurrences += 1;
    if (logged.has(date)) slot.shownUp += 1;
  }

  return counts.map((c) => ({
    ...c,
    pct: c.occurrences > 0 ? Math.round((c.shownUp / c.occurrences) * 100) : null,
  }));
}

/* ---------- where the effort goes ---------- */

export interface CategorySlice {
  category: string;
  label: string;
  emoji: string;
  logs: number;
}

/** Logs per category — how attention is actually distributed. */
export function categoryTotals(goals: Goal[], logs: Log[], memberId: string): CategorySlice[] {
  const catOf = new Map(goals.map((g) => [g.id, g.category]));
  const totals = new Map<string, number>();

  for (const l of logs) {
    if (l.member_id !== memberId) continue;
    // Goal-less logs are memories; they are their own category, not "other".
    const cat = l.goal_id === null ? "memories" : catOf.get(l.goal_id);
    if (!cat) continue;
    totals.set(cat, (totals.get(cat) ?? 0) + 1);
  }

  return [...totals.entries()]
    .map(([category, count]) => ({
      category,
      label: categoryMeta(category).label,
      emoji: categoryMeta(category).emoji,
      logs: count,
    }))
    .sort((a, b) => b.logs - a.logs);
}

/* ---------- momentum ---------- */

export interface Momentum {
  recent: number;
  previous: number;
  /** Percentage-point change, or null when there is no earlier window yet. */
  delta: number | null;
  windowDays: number;
}

/**
 * Last seven days against the seven before.
 *
 * Returns a null delta rather than a fake zero when the journey is too young to
 * have two windows — "no change" and "not enough history" are different things
 * and should not look the same.
 */
export function momentum(progress: JourneyProgress, memberId: string, windowDays = 7): Momentum {
  const mine = progress.members.find((m) => m.member.id === memberId);
  const logged = new Set(mine?.loggedDates ?? []);
  const elapsed = progress.dates.filter((d) => d <= progress.today);

  const recentDates = elapsed.slice(-windowDays);
  const prevDates = elapsed.slice(-windowDays * 2, -windowDays);

  const rate = (ds: string[]) =>
    ds.length ? Math.round((ds.filter((d) => logged.has(d)).length / ds.length) * 100) : 0;

  const recent = rate(recentDates);
  const previous = rate(prevDates);
  return {
    recent,
    previous,
    delta: prevDates.length === windowDays ? recent - previous : null,
    windowDays,
  };
}

/* ---------- goal load ---------- */

/** How many goals were running on a given day — the denominator behind a day. */
export function activeGoalCount(goals: Goal[], memberId: string, iso: string): number {
  return goals.filter(
    (g) =>
      (g.owner_member_id === null || g.owner_member_id === memberId) &&
      g.cadence === "daily" &&
      goalActiveOn(g, iso),
  ).length;
}

/** Completion rate for one day: met over active. Null when nothing was running. */
export function dayCompletion(
  goals: Goal[],
  logs: Log[],
  memberId: string,
  iso: string,
): number | null {
  const active = goals.filter(
    (g) =>
      (g.owner_member_id === null || g.owner_member_id === memberId) &&
      g.cadence === "daily" &&
      goalActiveOn(g, iso),
  );
  if (active.length === 0) return null;
  const met = active.filter((g) =>
    logs.some((l) => l.member_id === memberId && l.goal_id === g.id && l.date === iso && logMeetsTarget(g, l)),
  ).length;
  return Math.round((met / active.length) * 100);
}
