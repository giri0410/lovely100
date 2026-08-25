import type { JourneyKind } from "./copy";

export interface DailyHabit {
  id: string;
  journey_id: string;
  member_id: string;
  date: string;
  walk_completed: boolean;
  walk_duration: number | null;
  healthy_food_completed: boolean;
  unnecessary_spending_completed: boolean;
  certification_completed: boolean;
  certification_minutes: number | null;
  certification_topic: string | null;
  notes: string | null;
}

export interface Member {
  id: string;
  auth_user_id: string | null;
  journey_id: string;
  name: string;
  /** Optional. Someone doing their 100 days alone has no relationship to state. */
  relationship: string | null;
  avatar: string | null;
}

export interface Journey {
  id: string;
  name: string;
  start_date: string;
  duration: number;
  invite_code: string;
  is_demo: boolean;
  /**
   * Whether this journey is meant for one person or two. Stored rather than
   * derived from member count, because a shared journey with an unaccepted
   * invite has one member and would otherwise read as solo until they join.
   */
  kind: JourneyKind;
}

export interface AvoidedExpense {
  id: string;
  member_id: string;
  date: string;
  amount: number;
  description: string | null;
  reason: string | null;
}

/* ---------- dates ---------- */

export function toISO(d: Date): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function todayISO(): string {
  return toISO(new Date());
}

export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

export function addDays(iso: string, n: number): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

/** 1-based day number of the challenge for a given date. */
export function dayNumber(startDate: string, iso: string): number {
  const diff = Math.round((parseISO(iso).getTime() - parseISO(startDate).getTime()) / 86400000);
  return diff + 1;
}

export function dateForDay(startDate: string, day: number): string {
  return addDays(startDate, day - 1);
}

export function formatLongDate(iso: string): string {
  return parseISO(iso).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

export function formatShortDate(iso: string): string {
  return parseISO(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function weekNumberForDay(day: number): number {
  return Math.ceil(day / 7);
}

/* ---------- money & time ---------- */

export function formatMoney(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/* ---------- computations ---------- */

export type DayStatus = "completed" | "partial" | "missed" | "today" | "future";

/**
 * `total` is how many goals were actually active that day, not a constant. It
 * used to be hardcoded to 4, which silently broke the moment goals stopped
 * being the same four every day.
 *
 * A day with no active goals is "future" regardless of its date — there was
 * nothing to do, so calling it missed would blame the user for a day their
 * goals had not started yet.
 */
export function dayStatus(count: number, total: number, iso: string, today: string): DayStatus {
  if (iso > today) return "future";
  if (total <= 0) return "future";
  if (count >= total) return "completed";
  if (count > 0) return "partial";
  // An empty today is still ahead of you, not missed.
  if (iso === today) return "today";
  return "missed";
}

export interface StreakResult {
  current: number;
  best: number;
}

/**
 * Streaks over a list of ordered, lexicographically comparable period keys.
 *
 * Usually ISO dates, but any ascending string works — weekly goals pass
 * zero-padded week keys, which is why the parameters are not named `dates`.
 * `current` is the key for the period in progress; it does not break a streak
 * when incomplete, because a day (or week) you are still living is not a miss.
 */
export function computeStreak(keys: string[], done: (key: string) => boolean, current: string): StreakResult {
  let best = 0;
  let run = 0;
  for (const key of keys) {
    if (key > current) break;
    if (done(key)) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }
  let streak = 0;
  const past = keys.filter((k) => k <= current);
  for (let i = past.length - 1; i >= 0; i--) {
    const key = past[i]!;
    if (done(key)) streak += 1;
    else if (key === current) continue;
    else break;
  }
  return { current: streak, best };
}

export const MILESTONES = [7, 14, 30, 50, 75, 100];

/**
 * Kind-aware, and never mentions a second person unless there is one. The old
 * version told a solo user to "cheer on your partner".
 *
 * `total` is the day's active goal count, so "done for today" means done with
 * what was actually set — not with four things.
 */
export function encouragement(input: {
  myCount: number;
  total: number;
  day: number;
  /** True only when there is genuinely more than one member. */
  together: boolean;
  /** Whether every member finished the day. Ignored when not together. */
  allDone?: boolean;
}): string {
  const { myCount, total, day, together, allDone } = input;
  const done = total > 0 && myCount >= total;

  if (together && allDone) return "Great job! You both completed today. 💛";
  if (done) return together ? "You're done for today — cheer them on." : "You're done for today. 💛";
  if (myCount > 0) return together ? "You're building this together." : "Good start — keep going.";
  return `Day ${day}. One small step is enough to start.`;
}
