import { describe, expect, it } from "vitest";
import { addDays, isSunday, todayISO, type AvoidedExpense, type Couple, type DailyHabit, type Profile } from "./challenge";
import { buildStats, buildWeekStats, isWeekComplete, monthlySavings } from "./stats";

/**
 * Fixtures are built relative to the real current date because buildStats reads
 * todayISO() internally. A challenge that started `daysAgo` days ago puts today
 * on day `daysAgo + 1`.
 */
function makeCouple(daysAgo: number, duration = 100): Couple {
  return {
    id: "couple-1",
    name: "Test couple",
    start_date: addDays(todayISO(), -daysAgo),
    duration,
    invite_code: "TEST01",
    is_demo: false,
  };
}

function makeProfile(id: string, name: string): Profile {
  return { id, auth_user_id: `auth-${id}`, couple_id: "couple-1", name, relationship: "partner", avatar: null };
}

function habit(profileId: string, date: string, patch: Partial<DailyHabit> = {}): DailyHabit {
  return {
    id: `${profileId}-${date}`,
    couple_id: "couple-1",
    profile_id: profileId,
    date,
    walk_completed: false,
    walk_duration: null,
    healthy_food_completed: false,
    unnecessary_spending_completed: false,
    certification_completed: false,
    certification_minutes: null,
    certification_topic: null,
    notes: null,
    ...patch,
  };
}

const ALL_FOUR = {
  walk_completed: true,
  healthy_food_completed: true,
  unnecessary_spending_completed: true,
  certification_completed: true,
};

/** The ISO dates for days 1..n of a challenge that started `daysAgo` days ago. */
function firstDays(daysAgo: number, n: number): string[] {
  const start = addDays(todayISO(), -daysAgo);
  return Array.from({ length: n }, (_, i) => addDays(start, i));
}

const noExpenses: AvoidedExpense[] = [];

describe("buildStats — challenge shape", () => {
  it("puts today on the right day number and lays out the full duration", () => {
    const stats = buildStats(makeCouple(4), [], [], noExpenses);
    expect(stats.currentDay).toBe(5);
    expect(stats.today).toBe(todayISO());
    expect(stats.dates).toHaveLength(100);
    expect(stats.dates[0]).toBe(addDays(todayISO(), -4));
  });

  it("clamps the day number to the challenge window", () => {
    // Starts tomorrow: still day 1, never day 0 or negative.
    expect(buildStats(makeCouple(-1), [], [], noExpenses).currentDay).toBe(1);
    // Long finished: caps at the duration rather than running past it.
    expect(buildStats(makeCouple(500), [], [], noExpenses).currentDay).toBe(100);
  });

  it("respects a non-default duration", () => {
    const stats = buildStats(makeCouple(2, 30), [], [], noExpenses);
    expect(stats.dates).toHaveLength(30);
  });

  it("returns zeroed totals for a couple with no profiles", () => {
    const stats = buildStats(makeCouple(4), [], [], noExpenses);
    expect(stats.teamScore).toBe(0);
    expect(stats.coupleStreak).toEqual({ current: 0, best: 0 });
    expect(stats.completedDaysTogether).toBe(0);
  });
});

describe("buildStats — per person", () => {
  const me = makeProfile("p1", "Me");
  const partner = makeProfile("p2", "Partner");

  // Today is day 5. I finished days 1-3 fully and nothing since; my partner
  // finished all five days.
  const days = firstDays(4, 5);
  const habits: DailyHabit[] = [
    ...days.slice(0, 3).map((d) => habit("p1", d, { ...ALL_FOUR, certification_minutes: null })),
    ...days.map((d) => habit("p2", d, { ...ALL_FOUR, walk_duration: 40, certification_minutes: 60 })),
  ];

  const stats = buildStats(makeCouple(4), [me, partner], habits, noExpenses);
  const mine = stats.perProfile[0]!;
  const theirs = stats.perProfile[1]!;

  it("counts elapsed days, not the whole challenge", () => {
    expect(mine.daysElapsed).toBe(5);
  });

  it("scores completion against every habit on every elapsed day", () => {
    // 12 of a possible 20 checks.
    expect(mine.completionPct).toBe(60);
    expect(theirs.completionPct).toBe(100);
  });

  it("separates fully completed days from partial ones", () => {
    expect(mine.completedDays).toBe(3);
    expect(mine.partialDays).toBe(0);
    expect(theirs.completedDays).toBe(5);
  });

  it("counts a partial day as partial, not complete", () => {
    const partial = [habit("p1", days[0]!, { walk_completed: true, healthy_food_completed: true })];
    const s = buildStats(makeCouple(4), [me], partial, noExpenses);
    expect(s.perProfile[0]!.completedDays).toBe(0);
    expect(s.perProfile[0]!.partialDays).toBe(1);
    expect(s.perProfile[0]!.totalChecks).toBe(2);
  });

  it("defaults missing walk and study minutes to the 30-minute target", () => {
    expect(mine.walk.minutes).toBe(90); // 3 days x 30 assumed
    expect(mine.certification.minutes).toBe(90);
    expect(theirs.walk.minutes).toBe(200); // 5 days x 40 recorded
    expect(theirs.certification.minutes).toBe(300);
  });

  it("averages study time over days studied, not days elapsed", () => {
    expect(theirs.certification.days).toBe(5);
    expect(theirs.certification.avg).toBe(60);
  });

  it("reports zero average when nothing was studied", () => {
    const s = buildStats(makeCouple(4), [me], [], noExpenses);
    expect(s.perProfile[0]!.certification.avg).toBe(0);
  });

  it("counts a checked Sunday as a cheat day rather than a healthy day", () => {
    const sundays = days.filter(isSunday).length;
    expect(theirs.food.cheatSundays).toBe(sundays);
    expect(theirs.food.healthyDays).toBe(5 - sundays);
    // Either way it still counts toward diet consistency.
    expect(theirs.food.pct).toBe(100);
  });

  it("stops a streak on a missed day but not on an unfinished today", () => {
    expect(mine.streak.best).toBe(3);
    expect(mine.streak.current).toBe(0); // day 4 was missed and has passed
    expect(theirs.streak).toEqual({ current: 5, best: 5 });
  });
});

describe("buildStats — money", () => {
  const me = makeProfile("p1", "Me");
  const partner = makeProfile("p2", "Partner");
  const today = todayISO();
  const expenses: AvoidedExpense[] = [
    { id: "x1", profile_id: "p1", date: today, amount: 500, description: null, reason: null },
    { id: "x2", profile_id: "p2", date: today, amount: 1200, description: null, reason: null },
    { id: "x3", profile_id: "p2", date: today, amount: 300, description: null, reason: null },
  ];

  const stats = buildStats(makeCouple(4), [me, partner], [], expenses);

  it("attributes each avoided expense to the person who logged it", () => {
    expect(stats.perProfile[0]!.saved).toBe(500);
    expect(stats.perProfile[0]!.savedCount).toBe(1);
    expect(stats.perProfile[1]!.saved).toBe(1500);
    expect(stats.perProfile[1]!.savedCount).toBe(2);
  });

  it("totals the whole couple", () => {
    expect(stats.totalSaved).toBe(2000);
    expect(stats.totalSavedCount).toBe(3);
  });

  it("tolerates string amounts coming back from Postgres numeric", () => {
    // numeric(12,2) arrives as a string over PostgREST, hence the Number() calls.
    const s = buildStats(makeCouple(4), [me], [], [
      { id: "x", profile_id: "p1", date: today, amount: "250.50" as unknown as number, description: null, reason: null },
    ]);
    expect(s.perProfile[0]!.saved).toBeCloseTo(250.5);
    expect(s.totalSaved).toBeCloseTo(250.5);
  });
});

describe("buildStats — the couple view", () => {
  const me = makeProfile("p1", "Me");
  const partner = makeProfile("p2", "Partner");
  const days = firstDays(4, 5);

  it("averages both partners into the team score", () => {
    const habits = [
      ...days.slice(0, 3).map((d) => habit("p1", d, ALL_FOUR)),
      ...days.map((d) => habit("p2", d, ALL_FOUR)),
    ];
    const stats = buildStats(makeCouple(4), [me, partner], habits, noExpenses);
    expect(stats.teamScore).toBe(80); // (60 + 100) / 2
    expect(stats.overallPct).toBe(stats.teamScore);
  });

  it("only counts a day together when both partners finished all four", () => {
    const habits = [
      ...days.slice(0, 3).map((d) => habit("p1", d, ALL_FOUR)),
      ...days.map((d) => habit("p2", d, ALL_FOUR)),
    ];
    const stats = buildStats(makeCouple(4), [me, partner], habits, noExpenses);
    expect(stats.completedDaysTogether).toBe(3);
    expect(stats.coupleStreak.best).toBe(3);
  });

  it("shows a solo user their own score labelled as the team score", () => {
    // Documented gap: before a partner joins, "Together" is just you. Phase 3
    // makes the solo state honest — this expectation should change then.
    const habits = days.slice(0, 3).map((d) => habit("p1", d, ALL_FOUR));
    const stats = buildStats(makeCouple(4), [me], habits, noExpenses);
    expect(stats.teamScore).toBe(stats.perProfile[0]!.completionPct);
  });

  it("sums study minutes across both partners", () => {
    const habits = [
      habit("p1", days[0]!, { certification_completed: true, certification_minutes: 45 }),
      habit("p2", days[0]!, { certification_completed: true, certification_minutes: 75 }),
    ];
    const stats = buildStats(makeCouple(4), [me, partner], habits, noExpenses);
    expect(stats.totalStudyMinutes).toBe(120);
  });
});

describe("buildWeekStats", () => {
  const me = makeProfile("p1", "Me");
  // Today is day 8, so week 1 is fully elapsed and week 2 has one day.
  const days = firstDays(7, 8);
  const week1 = days.slice(0, 7);

  function statsFor(habits: DailyHabit[], expenses: AvoidedExpense[] = []) {
    const s = buildStats(makeCouple(7), [me], habits, expenses);
    return buildWeekStats(s.perProfile[0]!, week1, expenses);
  }

  it("returns zeroes for a week with nothing logged", () => {
    const w = statsFor([]);
    expect(w).toMatchObject({ daysCounted: 7, walkDays: 0, studyMinutes: 0, avoided: 0, overallPct: 0 });
  });

  it("counts each habit over the week", () => {
    const habits = week1.slice(0, 5).map((d) => habit("p1", d, { walk_completed: true }));
    const w = statsFor(habits);
    expect(w.walkDays).toBe(5);
    // 5 of 28 possible checks.
    expect(w.overallPct).toBe(18);
  });

  it("splits healthy days from cheat Sundays", () => {
    const habits = week1.map((d) => habit("p1", d, { healthy_food_completed: true }));
    const w = statsFor(habits);
    // A calendar week always contains exactly one Sunday.
    expect(w.cheatSundays).toBe(1);
    expect(w.healthyDays).toBe(6);
  });

  it("applies the 30-minute fallback for unrecorded study time", () => {
    const habits = [
      habit("p1", week1[0]!, { certification_completed: true, certification_minutes: null }),
      habit("p1", week1[1]!, { certification_completed: true, certification_minutes: 90 }),
    ];
    expect(statsFor(habits).studyMinutes).toBe(120);
  });

  it("only totals expenses dated inside the week", () => {
    const inside: AvoidedExpense = {
      id: "a", profile_id: "p1", date: week1[2]!, amount: 400, description: null, reason: null,
    };
    const outside: AvoidedExpense = {
      id: "b", profile_id: "p1", date: days[7]!, amount: 900, description: null, reason: null,
    };
    expect(statsFor([], [inside, outside]).avoided).toBe(400);
  });

  it("scores a fully completed week at 100%", () => {
    const habits = week1.map((d) => habit("p1", d, ALL_FOUR));
    expect(statsFor(habits).overallPct).toBe(100);
  });

  it("handles an undefined profile without throwing", () => {
    expect(buildWeekStats(undefined, week1, []).overallPct).toBe(0);
  });
});

describe("isWeekComplete", () => {
  it("is false while the week is still running", () => {
    expect(isWeekComplete(1, 1)).toBe(false);
    // Day 7 is the final day of week 1 — not over until it has passed.
    expect(isWeekComplete(1, 7)).toBe(false);
  });

  it("is true once every day of the week has passed", () => {
    expect(isWeekComplete(1, 8)).toBe(true);
    expect(isWeekComplete(2, 15)).toBe(true);
  });

  it("is false for a week that hasn't started", () => {
    expect(isWeekComplete(3, 8)).toBe(false);
  });
});

describe("monthlySavings", () => {
  const row = (date: string, amount: number): AvoidedExpense => ({
    id: date + amount,
    profile_id: "p1",
    date,
    amount,
    description: null,
    reason: null,
  });

  it("is empty with no expenses", () => {
    expect(monthlySavings([])).toEqual([]);
  });

  it("groups by calendar month and counts entries", () => {
    const result = monthlySavings([row("2026-08-02", 500), row("2026-08-20", 700), row("2026-07-15", 200)]);
    expect(result).toHaveLength(2);
    expect(result[0]!.total).toBe(1200);
    expect(result[0]!.count).toBe(2);
  });

  it("puts the most recent month first", () => {
    const result = monthlySavings([row("2026-07-15", 200), row("2026-09-01", 100), row("2026-08-02", 500)]);
    expect(result.map((r) => r.total)).toEqual([100, 500, 200]);
  });

  it("keeps months in different years apart", () => {
    const result = monthlySavings([row("2026-01-10", 100), row("2027-01-10", 300)]);
    expect(result).toHaveLength(2);
    expect(result[0]!.total).toBe(300);
  });
});
