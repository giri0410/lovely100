import {
  type AvoidedExpense,
  type Journey,
  type DailyHabit,
  type Member,
  computeStreak,
  completedCount,
  dateForDay,
  dayNumber,
  isSunday,
  todayISO,
} from "./challenge";

export interface MemberStats {
  member: Member;
  entriesByDate: Map<string, DailyHabit>;
  daysElapsed: number;
  completedDays: number;
  partialDays: number;
  totalChecks: number;
  completionPct: number;
  streak: { current: number; best: number };
  walk: { days: number; pct: number; current: number; best: number; minutes: number };
  food: { healthyDays: number; cheatSundays: number; pct: number };
  certification: { minutes: number; days: number; avg: number; current: number; best: number };
  saved: number;
  savedCount: number;
}

export interface JourneyStats {
  today: string;
  currentDay: number;
  dates: string[];
  perMember: MemberStats[];
  teamScore: number;
  totalSaved: number;
  totalSavedCount: number;
  totalStudyMinutes: number;
  journeyStreak: { current: number; best: number };
  completedDaysTogether: number;
  overallPct: number;
}

export function buildStats(journey: Journey, members: Member[], habits: DailyHabit[], expenses: AvoidedExpense[]): JourneyStats {
  const today = todayISO();
  const duration = journey.duration || 100;
  const rawDay = dayNumber(journey.start_date, today);
  const currentDay = Math.min(Math.max(rawDay, 1), duration);
  const dates = Array.from({ length: duration }, (_, i) => dateForDay(journey.start_date, i + 1));
  const daysElapsed = Math.min(Math.max(rawDay, 0), duration);

  const perMember = members.map((member) => {
    const entriesByDate = new Map<string, DailyHabit>();
    habits.filter((h) => h.member_id === member.id).forEach((h) => entriesByDate.set(h.date, h));

    const past = dates.filter((d) => d <= today);
    let completedDays = 0;
    let partialDays = 0;
    let totalChecks = 0;
    let walkDays = 0;
    let walkMinutes = 0;
    let healthyDays = 0;
    let cheatSundays = 0;
    let certMinutes = 0;
    let certDays = 0;

    for (const iso of past) {
      const e = entriesByDate.get(iso);
      const c = completedCount(e);
      totalChecks += c;
      if (c === 4) completedDays += 1;
      else if (c > 0) partialDays += 1;
      if (e?.walk_completed) {
        walkDays += 1;
        walkMinutes += e.walk_duration ?? 30;
      }
      if (e?.healthy_food_completed) {
        if (isSunday(iso)) cheatSundays += 1;
        else healthyDays += 1;
      }
      if (e?.certification_completed) {
        certDays += 1;
        certMinutes += e.certification_minutes ?? 30;
      }
    }

    const done = (col: keyof DailyHabit) => (iso: string) => Boolean(entriesByDate.get(iso)?.[col]);
    const allDone = (iso: string) => completedCount(entriesByDate.get(iso)) === 4;

    const myExpenses = expenses.filter((e) => e.member_id === member.id);
    const saved = myExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);

    const elapsed = Math.max(past.length, 1);
    return {
      member,
      entriesByDate,
      daysElapsed: past.length,
      completedDays,
      partialDays,
      totalChecks,
      completionPct: Math.round((totalChecks / (elapsed * 4)) * 100),
      streak: computeStreak(dates, allDone, today),
      walk: {
        days: walkDays,
        pct: Math.round((walkDays / elapsed) * 100),
        minutes: walkMinutes,
        ...computeStreak(dates, done("walk_completed"), today),
      },
      food: {
        healthyDays,
        cheatSundays,
        pct: Math.round(((healthyDays + cheatSundays) / elapsed) * 100),
      },
      certification: {
        minutes: certMinutes,
        days: certDays,
        avg: certDays ? Math.round(certMinutes / certDays) : 0,
        ...computeStreak(dates, done("certification_completed"), today),
      },
      saved,
      savedCount: myExpenses.length,
    } satisfies MemberStats;
  });

  const teamScore = perMember.length
    ? Math.round(perMember.reduce((s, p) => s + p.completionPct, 0) / perMember.length)
    : 0;

  const journeyAllDone = (iso: string) =>
    perMember.length > 0 && perMember.every((p) => completedCount(p.entriesByDate.get(iso)) === 4);

  return {
    today,
    currentDay,
    dates,
    perMember,
    teamScore,
    totalSaved: expenses.reduce((s, e) => s + Number(e.amount || 0), 0),
    totalSavedCount: expenses.length,
    totalStudyMinutes: perMember.reduce((s, p) => s + p.certification.minutes, 0),
    journeyStreak: computeStreak(dates, journeyAllDone, today),
    completedDaysTogether: dates.filter((d) => d <= today && journeyAllDone(d)).length,
    overallPct: teamScore,
    daysElapsed,
  } as JourneyStats & { daysElapsed: number };
}

export interface WeekStats {
  /** Elapsed days in the week — 7 once the week is over, fewer mid-week. */
  daysCounted: number;
  walkDays: number;
  healthyDays: number;
  cheatSundays: number;
  studyMinutes: number;
  avoided: number;
  overallPct: number;
}

/**
 * One person's numbers for a single week. Extracted so the weekly review shares
 * the same conventions as the rest of the app — most importantly the 30-minute
 * fallback for unrecorded study time, and counting a checked Sunday as a cheat
 * day rather than a healthy one.
 *
 * `expenses` is whatever scope the caller wants totalled; the review passes the
 * whole journey's, matching what it has always shown.
 */
export function buildWeekStats(
  memberStats: MemberStats | undefined,
  weekDates: string[],
  expenses: AvoidedExpense[],
): WeekStats {
  const entry = (iso: string) => memberStats?.entriesByDate.get(iso);
  let walkDays = 0;
  let healthyDays = 0;
  let cheatSundays = 0;
  let studyMinutes = 0;
  let checks = 0;

  for (const iso of weekDates) {
    const e = entry(iso);
    checks += completedCount(e);
    if (e?.walk_completed) walkDays += 1;
    if (e?.healthy_food_completed) {
      if (isSunday(iso)) cheatSundays += 1;
      else healthyDays += 1;
    }
    if (e?.certification_completed) studyMinutes += e.certification_minutes ?? 30;
  }

  const weekSet = new Set(weekDates);
  return {
    daysCounted: weekDates.length,
    walkDays,
    healthyDays,
    cheatSundays,
    studyMinutes,
    avoided: expenses.filter((e) => weekSet.has(e.date)).reduce((s, e) => s + Number(e.amount || 0), 0),
    overallPct: weekDates.length ? Math.round((checks / (weekDates.length * 4)) * 100) : 0,
  };
}

/** Whether every day of `week` has already passed. */
export function isWeekComplete(week: number, currentDay: number): boolean {
  return currentDay > week * 7;
}

export function monthlySavings(expenses: AvoidedExpense[]): { label: string; total: number; count: number }[] {
  const map = new Map<string, { total: number; count: number }>();
  for (const e of expenses) {
    const key = e.date.slice(0, 7);
    const cur = map.get(key) ?? { total: 0, count: 0 };
    cur.total += Number(e.amount || 0);
    cur.count += 1;
    map.set(key, cur);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([key, v]) => {
      const [y, m] = key.split("-").map(Number);
      const label = new Date(y!, (m ?? 1) - 1, 1).toLocaleDateString(undefined, { month: "short", year: "numeric" });
      return { label, ...v };
    });
}
