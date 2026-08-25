import { describe, expect, it } from "vitest";
import { addDays, todayISO, type Journey, type Member } from "./challenge";
import type { Goal, Log } from "./goals";
import { buildProgress } from "./progress";
import {
  categoryTotals,
  dayCompletion,
  dayOfWeekPattern,
  goalBars,
  momentum,
  weeklyShowUp,
} from "./analytics";

const TODAY = todayISO();
const START = addDays(TODAY, -20); // day 21 today

const journey = (o: Partial<Journey> = {}): Journey => ({
  id: "j1", name: "J", start_date: START, duration: 100,
  invite_code: "ABC123", is_demo: false, kind: "solo", ...o,
});
const member = (id: string): Member => ({
  id, auth_user_id: `a-${id}`, journey_id: "j1", name: id, relationship: null, avatar: null,
});
const goal = (o: Partial<Goal> = {}): Goal => ({
  id: "g1", journey_id: "j1", owner_member_id: null, category: "health", title: "Walk",
  icon: null, color: null, cadence: "daily", metric: "bool", unit: null,
  target_per_period: null, target_total: null, starts_on: START, sort_order: 1,
  archived_at: null, ...o,
});
let n = 0;
const log = (o: Partial<Log> = {}): Log => ({
  id: `l${n++}`, journey_id: "j1", member_id: "m1", goal_id: "g1", date: TODAY,
  occurred_at: `${TODAY}T08:00:00.000Z`, slot: TODAY, done: true, amount: null,
  note: null, place: null, ...o,
});

describe("weeklyShowUp", () => {
  it("buckets by journey week and marks the week in progress", () => {
    const logs = [0, 1, 2, 7, 8].map((i) => log({ date: addDays(START, i) }));
    const p = buildProgress(journey(), [member("m1")], [goal()], logs);
    const w = weeklyShowUp(p, "m1");
    expect(w.map((x) => x.label)).toEqual(["W1", "W2", "W3"]);
    expect(w[0]).toMatchObject({ daysShownUp: 3, daysElapsed: 7, pct: 43, complete: true });
    expect(w[1]).toMatchObject({ daysShownUp: 2, daysElapsed: 7, complete: true });
    // Day 21 is today, so week 3 has 7 elapsed days but is the current one.
    expect(w[2]!.daysElapsed).toBe(7);
  });

  // The denominator must be elapsed days, never a flat 7.
  it("never counts more elapsed days than have happened", () => {
    const p = buildProgress(journey({ start_date: addDays(TODAY, -2) }), [member("m1")], [goal()], []);
    const w = weeklyShowUp(p, "m1");
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ daysElapsed: 3, complete: false });
  });

  it("returns nothing for a member who is not in the journey", () => {
    const p = buildProgress(journey(), [member("m1")], [goal()], []);
    expect(weeklyShowUp(p, "nobody")).toEqual([]);
  });
});

describe("goalBars", () => {
  it("puts goals with a percentage first, best to worst", () => {
    const goals = [
      goal({ id: "a", title: "A" }),
      goal({ id: "b", title: "B" }),
      goal({ id: "open", title: "Open", cadence: "open", target_total: null }),
    ];
    const logs = [
      ...[0, 1, 2, 3].map((i) => log({ goal_id: "a", date: addDays(START, i) })),
      log({ goal_id: "b", date: addDays(START, 0) }),
      log({ goal_id: "open", slot: null }),
    ];
    const p = buildProgress(journey(), [member("m1")], goals, logs);
    const bars = goalBars(p.members[0]!);
    expect(bars.map((b) => b.title)).toEqual(["A", "B", "Open"]);
    // An open goal with no total has no honest percentage.
    expect(bars[2]!.pct).toBeNull();
    expect(bars[2]!.done).toBe(1);
  });

  it("leaves archived goals out", () => {
    const goals = [goal({ id: "a" }), goal({ id: "z", archived_at: `${TODAY}T00:00:00Z` })];
    const p = buildProgress(journey(), [member("m1")], goals, []);
    expect(goalBars(p.members[0]!).map((b) => b.goalId)).toEqual(["a"]);
  });
});

describe("dayOfWeekPattern", () => {
  it("divides by how often each weekday has actually occurred", () => {
    const p = buildProgress(journey(), [member("m1")], [goal()], []);
    const rows = dayOfWeekPattern(p, "m1");
    expect(rows).toHaveLength(7);
    // 21 elapsed days = each weekday 3 times exactly.
    expect(rows.every((r) => r.occurrences === 3)).toBe(true);
  });

  it("reports null rather than 0% for a weekday that has not come round", () => {
    const p = buildProgress(journey({ start_date: TODAY }), [member("m1")], [goal()], []);
    const rows = dayOfWeekPattern(p, "m1");
    const untouched = rows.filter((r) => r.occurrences === 0);
    expect(untouched.length).toBe(6);
    expect(untouched.every((r) => r.pct === null)).toBe(true);
  });
});

describe("categoryTotals", () => {
  it("counts logs per category, memories as their own", () => {
    const goals = [goal({ id: "h", category: "health" }), goal({ id: "c", category: "cooking" })];
    const logs = [
      log({ goal_id: "h", date: addDays(START, 0) }),
      log({ goal_id: "h", date: addDays(START, 1) }),
      log({ goal_id: "c", date: addDays(START, 0) }),
      log({ goal_id: null, slot: null, date: addDays(START, 0) }),
    ];
    const out = categoryTotals(goals, logs, "m1");
    expect(out.map((c) => [c.category, c.logs])).toEqual([
      ["health", 2], ["cooking", 1], ["memories", 1],
    ]);
  });

  it("ignores other members' logs", () => {
    const goals = [goal({ id: "h" })];
    const logs = [log({ goal_id: "h", member_id: "m2" })];
    expect(categoryTotals(goals, logs, "m1")).toEqual([]);
  });
});

describe("momentum", () => {
  it("compares the last window with the one before", () => {
    // Logged every day of the most recent 7, none in the 7 before.
    const logs = Array.from({ length: 7 }, (_, i) => log({ date: addDays(TODAY, -i) }));
    const p = buildProgress(journey(), [member("m1")], [goal()], logs);
    const m = momentum(p, "m1");
    expect(m.recent).toBe(100);
    expect(m.previous).toBe(0);
    expect(m.delta).toBe(100);
  });

  // "No change" and "not enough history" must not look identical.
  it("gives a null delta when there is no earlier window yet", () => {
    const p = buildProgress(journey({ start_date: addDays(TODAY, -3) }), [member("m1")], [goal()], []);
    expect(momentum(p, "m1").delta).toBeNull();
  });
});

describe("dayCompletion", () => {
  it("is met over active for that day", () => {
    const goals = [goal({ id: "a" }), goal({ id: "b" })];
    const logs = [log({ goal_id: "a", date: addDays(START, 3) })];
    expect(dayCompletion(goals, logs, "m1", addDays(START, 3))).toBe(50);
  });

  it("is null on a day with no goals running, not 0%", () => {
    const goals = [goal({ starts_on: TODAY })];
    expect(dayCompletion(goals, [], "m1", addDays(START, 1))).toBeNull();
  });

  it("does not credit a quantified goal that fell short of its target", () => {
    const goals = [goal({ id: "a", metric: "number", target_per_period: 30 })];
    const logs = [log({ goal_id: "a", date: addDays(START, 2), amount: 10 })];
    expect(dayCompletion(goals, logs, "m1", addDays(START, 2))).toBe(0);
  });
});
