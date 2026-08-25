/**
 * Progress over user-defined goals.
 *
 * Replaces the four-habit engine in stats.ts. That module stays until P4 moves
 * the screens across; nothing here reads daily_habits.
 *
 *
 * TWO THINGS THE OLD ENGINE DID THAT THIS ONE MUST NOT
 *
 * It invented data. A null walk_duration or certification_minutes was counted
 * as 30 minutes, so the app reported study time nobody had recorded. Here an
 * unrecorded amount contributes nothing, and `amountDays` is tracked separately
 * so an average is over days that actually have a number.
 *
 * It hardcoded one couple's diet plan — "a checked Sunday is a cheat day, not a
 * healthy day" — which is meaningless for a cooking or travel goal. Gone, with
 * no replacement until someone asks for rest days.
 *
 *
 * NEVER AVERAGE PERCENTAGES ACROSS INCOMMENSURATE GOALS
 *
 * "Walk 30 minutes a day" and "visit 10 places" share no denominator, so there
 * is no honest number that combines them. `pct` is therefore null wherever a
 * real denominator is missing, and the UI shows a count instead of a
 * fabricated 0%. Every percentage below has a stated denominator.
 */

import {
  computeStreak,
  dateForDay,
  dayNumber,
  todayISO,
  weekNumberForDay,
  type Journey,
  type Member,
} from "./challenge";
import { logMeetsTarget, type Goal, type Log } from "./goals";

/* ---------- period keys ---------- */

/**
 * Journey-relative week number, not the ISO week. Week 1 is days 1-7 of the
 * journey, which is what `review.tsx` already means by "week 3" and what a user
 * counting their own 100 days means too.
 */
export function weekOf(journeyStart: string, iso: string): number {
  return weekNumberForDay(dayNumber(journeyStart, iso));
}

/** Zero-padded so week keys sort lexicographically for computeStreak. */
export function weekKey(week: number): string {
  return `W${String(week).padStart(4, "0")}`;
}

/* ---------- shapes ---------- */

export interface GoalProgress {
  goal: Goal;

  /**
   * Periods that counted. For a daily goal, days the target was met; for a
   * weekly goal, qualifying logs; for an open goal, logs recorded.
   */
  unitsDone: number;

  /** The denominator, or null when the goal sets no target to measure against. */
  target: number | null;

  /** Only ever set when `target` is. Null means "show the count instead". */
  pct: number | null;

  /**
   * Sum of recorded amounts, or null for a bool goal. Never inferred from a
   * missing value — that was the old engine's lie.
   */
  amountTotal: number | null;

  /** Days that actually carried an amount, so an average has a real divisor. */
  amountDays: number;

  /** Day streaks for daily goals, week streaks for weekly, null for open. */
  streak: { current: number; best: number; unit: "day" | "week" } | null;

  /** Progress inside the period in flight, kept out of `pct`. See below. */
  currentPeriod: { done: number; target: number | null } | null;

  lastLoggedDate: string | null;
  logCount: number;
}

export interface MemberProgress {
  member: Member;
  goals: GoalProgress[];

  /** Distinct dates with at least one log — the show-up number. */
  activeDays: number;

  /** activeDays over elapsed days, or null before any day has elapsed. */
  showUpPct: number | null;

  /**
   * Checks over opportunities, summed per day across the daily goals actually
   * active that day. This is what replaces the old hardcoded `* 4`: a member
   * with two daily goals is measured out of two, not four.
   */
  dailyConsistencyPct: number | null;

  /** Logs attached to no goal. */
  momentCount: number;

  /** Day streak over days the member logged anything at all. */
  showUpStreak: { current: number; best: number };
}

export interface JourneyProgress {
  today: string;
  /** 1-based, clamped to the journey's duration. */
  currentDay: number;
  /** Every date in the journey, ascending. */
  dates: string[];
  /** Elapsed days, counting today. */
  daysElapsed: number;

  members: MemberProgress[];

  /** Goals belonging to the journey rather than one member. */
  sharedGoals: Goal[];

  /** Days at least one member logged something — the journey was alive. */
  aliveDays: number;
  aliveDaysPct: number | null;

  /**
   * Days every member logged something. For a solo journey this equals
   * aliveDays; for a shared one it is the honest "we both showed up" number.
   */
  togetherDays: number;
  togetherDaysPct: number | null;
  togetherStreak: { current: number; best: number };

  /** Goal-less logs across the journey, newest first. */
  moments: Log[];

  byDate: Map<string, DateSummary>;
}

export interface DateSummary {
  date: string;
  day: number;
  logCount: number;
  momentCount: number;
  /** Daily goals active on this date, across all members. */
  dailyActive: number;
  /** Of those, how many were met. */
  dailyMet: number;
  memberIds: string[];
}

/* ---------- helpers ---------- */

function pct(done: number, target: number): number {
  return Math.round((done / target) * 100);
}

/** A goal counts on a date once it has started and before it was archived. */
function goalActiveOn(goal: Goal, iso: string): boolean {
  if (goal.starts_on > iso) return false;
  if (goal.archived_at && goal.archived_at.slice(0, 10) <= iso) return false;
  return true;
}

/**
 * Days that count as opportunities: every elapsed day except an untouched
 * today.
 *
 * A day you are still living is not a miss. Streaks already work this way and
 * so does dailyConsistency, so show-up percentages must too — otherwise a
 * journey opened on day one greets the user with "0% — days you showed up",
 * which is precisely the fabricated zero this module exists to avoid.
 */
function countableDays(dates: string[], today: string, logged: (iso: string) => boolean): string[] {
  return dates.filter((d) => d <= today).filter((d) => d !== today || logged(d));
}

/* ---------- goal progress ---------- */

/**
 * Progress for one goal from one member's logs.
 *
 * The denominator rule, which is the whole point of this function:
 *
 *   daily  elapsed days the goal was active. Today is included only once it
 *          has been logged — the same courtesy computeStreak extends, so an
 *          untouched today reads as "not yet" rather than dragging the number
 *          down. Nothing elapsed yet means pct is null, not 0%.
 *
 *   weekly complete weeks x target_per_period. The week in flight is excluded
 *          and reported in `currentPeriod`, because counting a full week's
 *          target on its first day would make every Monday look like failure.
 *          No target_per_period means no denominator at all.
 *
 *   open   target_total. No total means no denominator: "places visited: 7" is
 *          the honest reading, not a percentage of nothing.
 */
export function buildGoalProgress(
  goal: Goal,
  logs: Log[],
  ctx: { journeyStart: string; dates: string[]; today: string },
): GoalProgress {
  const mine = logs.filter((l) => l.goal_id === goal.id);
  const met = mine.filter((l) => logMeetsTarget(goal, l));

  const amounts = mine.filter((l) => l.amount !== null);
  const amountTotal =
    goal.metric === "number" ? amounts.reduce((s, l) => s + Number(l.amount ?? 0), 0) : null;

  const dates = [...mine.map((l) => l.date)].sort();
  const lastLoggedDate = dates.length ? dates[dates.length - 1]! : null;

  const base = {
    goal,
    amountTotal,
    amountDays: amounts.length,
    lastLoggedDate,
    logCount: mine.length,
  };

  if (goal.cadence === "open") {
    const done = met.length;
    const target = goal.target_total;
    return {
      ...base,
      unitsDone: done,
      target,
      pct: target ? Math.min(pct(done, target), 100) : null,
      streak: null, // An open goal has no rhythm to break.
      currentPeriod: null,
    };
  }

  const metByDate = new Set(met.map((l) => l.date));
  const elapsedActive = ctx.dates.filter(
    (d) => d <= ctx.today && goalActiveOn(goal, d),
  );

  if (goal.cadence === "daily") {
    // Today enters the denominator only once it has been logged.
    const denomDates = elapsedActive.filter((d) => d !== ctx.today || metByDate.has(d));
    const done = elapsedActive.filter((d) => metByDate.has(d)).length;
    const streak = computeStreak(elapsedActive, (d) => metByDate.has(d), ctx.today);
    return {
      ...base,
      unitsDone: done,
      target: denomDates.length || null,
      pct: denomDates.length ? pct(done, denomDates.length) : null,
      streak: { ...streak, unit: "day" },
      currentPeriod: {
        done: metByDate.has(ctx.today) ? 1 : 0,
        target: 1,
      },
    };
  }

  // weekly
  const perWeek = new Map<number, number>();
  for (const l of met) {
    const w = weekOf(ctx.journeyStart, l.date);
    perWeek.set(w, (perWeek.get(w) ?? 0) + 1);
  }
  const perPeriod = goal.target_per_period;
  const currentWeek = weekOf(ctx.journeyStart, ctx.today);
  const activeWeeks = [...new Set(elapsedActive.map((d) => weekOf(ctx.journeyStart, d)))].sort(
    (a, b) => a - b,
  );
  const completeWeeks = activeWeeks.filter((w) => w < currentWeek);

  const doneInCompleteWeeks = completeWeeks.reduce((s, w) => s + (perWeek.get(w) ?? 0), 0);
  const target = perPeriod && completeWeeks.length ? completeWeeks.length * perPeriod : null;

  const weekMet = (key: string) => {
    const w = Number(key.slice(1));
    const count = perWeek.get(w) ?? 0;
    return perPeriod ? count >= perPeriod : count > 0;
  };
  const streak = computeStreak(activeWeeks.map(weekKey), weekMet, weekKey(currentWeek));

  return {
    ...base,
    unitsDone: met.length,
    target,
    pct: target ? Math.min(pct(doneInCompleteWeeks, target), 100) : null,
    streak: { ...streak, unit: "week" },
    currentPeriod: { done: perWeek.get(currentWeek) ?? 0, target: perPeriod },
  };
}

/* ---------- rollups ---------- */

/**
 * Daily consistency: checks over opportunities, counted per day.
 *
 * The old engine divided by `elapsed * 4` because there were always exactly
 * four habits. Now the divisor is computed a day at a time from the daily goals
 * active on that day, so adding a fifth goal on day 40 does not retroactively
 * change what days 1-39 were measured out of.
 *
 * Returns null rather than 0 when no opportunity has arisen yet.
 */
function dailyConsistency(
  goals: Goal[],
  logs: Log[],
  ctx: { dates: string[]; today: string },
): number | null {
  const dailyGoals = goals.filter((g) => g.cadence === "daily");
  if (!dailyGoals.length) return null;

  const metKey = new Set(
    logs
      .filter((l) => l.goal_id !== null)
      .filter((l) => {
        const g = dailyGoals.find((x) => x.id === l.goal_id);
        return g ? logMeetsTarget(g, l) : false;
      })
      .map((l) => `${l.goal_id}|${l.date}`),
  );

  let opportunities = 0;
  let met = 0;
  for (const date of ctx.dates) {
    if (date > ctx.today) break;
    for (const g of dailyGoals) {
      if (!goalActiveOn(g, date)) continue;
      const hit = metKey.has(`${g.id}|${date}`);
      // Today only counts against you once you have logged something for it.
      if (date === ctx.today && !hit) continue;
      opportunities += 1;
      if (hit) met += 1;
    }
  }
  return opportunities ? pct(met, opportunities) : null;
}

export function buildMemberProgress(
  member: Member,
  goals: Goal[],
  logs: Log[],
  ctx: { journeyStart: string; dates: string[]; today: string; daysElapsed: number },
): MemberProgress {
  const mine = logs.filter((l) => l.member_id === member.id);

  // Journey-wide goals plus this member's own; never the other member's.
  const visible = goals.filter(
    (g) => g.owner_member_id === null || g.owner_member_id === member.id,
  );

  const loggedDates = new Set(mine.map((l) => l.date));
  const elapsed = ctx.dates.filter((d) => d <= ctx.today);
  const countable = countableDays(ctx.dates, ctx.today, (d) => loggedDates.has(d));
  const activeDays = elapsed.filter((d) => loggedDates.has(d)).length;

  return {
    member,
    goals: visible.map((g) => buildGoalProgress(g, mine, ctx)),
    activeDays,
    showUpPct: countable.length ? pct(activeDays, countable.length) : null,
    dailyConsistencyPct: dailyConsistency(visible, mine, ctx),
    momentCount: mine.filter((l) => l.goal_id === null).length,
    showUpStreak: computeStreak(elapsed, (d) => loggedDates.has(d), ctx.today),
  };
}

/**
 * The whole journey.
 *
 * The headline number is "days you showed up" — distinct dates carrying at
 * least one log, over days elapsed. It works for one person, works for any mix
 * of cadences, cannot be inflated, and fits "100 days of memories" far better
 * than an average of completion percentages ever did.
 */
export function buildProgress(
  journey: Journey,
  members: Member[],
  goals: Goal[],
  logs: Log[],
): JourneyProgress {
  const today = todayISO();
  const duration = journey.duration || 100;
  const rawDay = dayNumber(journey.start_date, today);
  const currentDay = Math.min(Math.max(rawDay, 1), duration);
  const dates = Array.from({ length: duration }, (_, i) => dateForDay(journey.start_date, i + 1));
  const daysElapsed = Math.min(Math.max(rawDay, 0), duration);
  const elapsed = dates.filter((d) => d <= today);

  const ctx = { journeyStart: journey.start_date, dates, today, daysElapsed };
  const memberProgress = members.map((m) => buildMemberProgress(m, goals, logs, ctx));

  // Per-date rollup, used by the calendar.
  const byDate = new Map<string, DateSummary>();
  const dailyGoals = goals.filter((g) => g.cadence === "daily");
  dates.forEach((date, i) => {
    const onDate = logs.filter((l) => l.date === date);
    let dailyActive = 0;
    let dailyMet = 0;
    for (const m of members) {
      const visible = dailyGoals.filter(
        (g) => g.owner_member_id === null || g.owner_member_id === m.id,
      );
      for (const g of visible) {
        if (!goalActiveOn(g, date)) continue;
        dailyActive += 1;
        const hit = onDate.some(
          (l) => l.member_id === m.id && l.goal_id === g.id && logMeetsTarget(g, l),
        );
        if (hit) dailyMet += 1;
      }
    }
    byDate.set(date, {
      date,
      day: i + 1,
      logCount: onDate.length,
      momentCount: onDate.filter((l) => l.goal_id === null).length,
      dailyActive,
      dailyMet,
      memberIds: [...new Set(onDate.map((l) => l.member_id))],
    });
  });

  const loggedByMember = new Map(
    members.map((m) => [m.id, new Set(logs.filter((l) => l.member_id === m.id).map((l) => l.date))]),
  );
  const anyLogged = (d: string) => members.some((m) => loggedByMember.get(m.id)?.has(d));
  const allLogged = (d: string) =>
    members.length > 0 && members.every((m) => loggedByMember.get(m.id)?.has(d));

  const aliveDays = elapsed.filter(anyLogged).length;
  const togetherDays = elapsed.filter(allLogged).length;
  const aliveDenom = countableDays(dates, today, anyLogged).length;
  const togetherDenom = countableDays(dates, today, allLogged).length;

  return {
    today,
    currentDay,
    dates,
    daysElapsed,
    members: memberProgress,
    sharedGoals: goals.filter((g) => g.owner_member_id === null),
    aliveDays,
    aliveDaysPct: aliveDenom ? pct(aliveDays, aliveDenom) : null,
    togetherDays,
    togetherDaysPct: togetherDenom ? pct(togetherDays, togetherDenom) : null,
    togetherStreak: computeStreak(elapsed, allLogged, today),
    moments: logs
      .filter((l) => l.goal_id === null)
      .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)),
    byDate,
  };
}

/* ---------- badges ---------- */

export interface Badge {
  days: number;
  label: string;
  emoji: string;
}

/**
 * Badges are derived, never stored: a pure function of the furthest day
 * reached, so there is no table and no write path to keep in sync.
 *
 * Earned when currentDay reaches the threshold. Because currentDay is clamped
 * to the journey's duration, extending a journey is what unlocks the next one —
 * setting duration to 365 on day one earns nothing.
 */
export const BADGE_THRESHOLDS: Badge[] = [
  { days: 100, label: "The Hundred", emoji: "🏅" },
  { days: 150, label: "Past the Hundred", emoji: "🥈" },
  { days: 200, label: "Two Hundred", emoji: "🥇" },
  { days: 300, label: "Three Hundred", emoji: "💎" },
  { days: 365, label: "A Whole Year", emoji: "👑" },
];

export function badgesEarned(currentDay: number): Badge[] {
  return BADGE_THRESHOLDS.filter((b) => currentDay >= b.days);
}

export function nextBadge(currentDay: number): Badge | null {
  return BADGE_THRESHOLDS.find((b) => currentDay < b.days) ?? null;
}
