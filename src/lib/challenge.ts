export type HabitKey = "walk" | "food" | "spending" | "certification";

export interface HabitDef {
  key: HabitKey;
  label: string;
  hint: string;
  column: "walk_completed" | "healthy_food_completed" | "unnecessary_spending_completed" | "certification_completed";
  emoji: string;
}

export const HABITS: HabitDef[] = [
  { key: "walk", label: "Morning Walk", hint: "30 minutes", column: "walk_completed", emoji: "🚶" },
  { key: "food", label: "Healthy Food", hint: "Follow today's diet", column: "healthy_food_completed", emoji: "🥗" },
  {
    key: "spending",
    label: "No Unnecessary Spending",
    hint: "Avoid unnecessary purchases",
    column: "unnecessary_spending_completed",
    emoji: "💸",
  },
  { key: "certification", label: "Certification", hint: "30+ minutes", column: "certification_completed", emoji: "📘" },
];

export interface DailyHabit {
  id: string;
  couple_id: string;
  profile_id: string;
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

export interface Profile {
  id: string;
  auth_user_id: string | null;
  couple_id: string;
  name: string;
  relationship: string;
  avatar: string | null;
}

export interface Couple {
  id: string;
  name: string;
  start_date: string;
  duration: number;
  invite_code: string;
  is_demo: boolean;
}

export interface AvoidedExpense {
  id: string;
  profile_id: string;
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

export function isSunday(iso: string): boolean {
  return parseISO(iso).getDay() === 0;
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

export function completedCount(entry?: DailyHabit | null): number {
  if (!entry) return 0;
  return HABITS.reduce((sum, h) => sum + (entry[h.column] ? 1 : 0), 0);
}

export type DayStatus = "completed" | "partial" | "missed" | "today" | "future";

export function dayStatus(count: number, iso: string, today: string): DayStatus {
  if (iso > today) return "future";
  if (iso === today) return "today";
  if (count === 4) return "completed";
  if (count > 0) return "partial";
  return "missed";
}

export interface StreakResult {
  current: number;
  best: number;
}

/**
 * Streaks over a list of ISO dates ordered ascending, with a predicate for "done".
 * The current streak counts back from today (today itself doesn't break it if incomplete).
 */
export function computeStreak(dates: string[], done: (iso: string) => boolean, today: string): StreakResult {
  let best = 0;
  let run = 0;
  for (const iso of dates) {
    if (iso > today) break;
    if (done(iso)) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }
  let current = 0;
  const past = dates.filter((d) => d <= today);
  for (let i = past.length - 1; i >= 0; i--) {
    const iso = past[i]!;
    if (done(iso)) current += 1;
    else if (iso === today) continue;
    else break;
  }
  return { current, best };
}

export const MILESTONES = [7, 14, 30, 50, 75, 100];

export function encouragement(bothDone: boolean, myCount: number, day: number): string {
  if (bothDone) return "Great job! Both of you completed today. 💛";
  if (myCount === 4) return "You're done for today — cheer on your partner.";
  if (myCount > 0) return "You're building this habit together.";
  return `Day ${day}. One small step is enough to start.`;
}
