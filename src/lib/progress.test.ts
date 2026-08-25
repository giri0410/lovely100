import { describe, expect, it } from "vitest";
import { addDays, todayISO, type Journey, type Member } from "./challenge";
import type { Goal, Log } from "./goals";
import {
  badgesEarned,
  buildGoalProgress,
  buildMemberProgress,
  buildProgress,
  nextBadge,
  weekKey,
  weekOf,
} from "./progress";

const TODAY = todayISO();
/** Journey that started 20 days ago, so day 21 is today. */
const START = addDays(TODAY, -20);

function journey(over: Partial<Journey> = {}): Journey {
  return {
    id: "j1",
    name: "J",
    start_date: START,
    duration: 100,
    invite_code: "ABC123",
    is_demo: false,
    kind: "solo",
    ...over,
  };
}

function member(id: string, over: Partial<Member> = {}): Member {
  return {
    id,
    auth_user_id: `auth-${id}`,
    journey_id: "j1",
    name: id,
    relationship: null,
    avatar: null,
    ...over,
  };
}

function goal(over: Partial<Goal> = {}): Goal {
  return {
    id: "g1",
    journey_id: "j1",
    owner_member_id: null,
    category: "health",
    title: "Walk",
    icon: null,
    color: null,
    cadence: "daily",
    metric: "bool",
    unit: null,
    target_per_period: null,
    target_total: null,
    starts_on: START,
    sort_order: 1,
    archived_at: null,
    ...over,
  };
}

let seq = 0;
function log(over: Partial<Log> = {}): Log {
  seq += 1;
  return {
    id: `l${seq}`,
    journey_id: "j1",
    member_id: "m1",
    goal_id: "g1",
    date: TODAY,
    occurred_at: `${TODAY}T07:00:00.000Z`,
    slot: TODAY,
    done: true,
    amount: null,
    note: null,
    place: null,
    ...over,
  };
}

const ctx = (over: Partial<{ journeyStart: string; dates: string[]; today: string }> = {}) => {
  const dates = Array.from({ length: 100 }, (_, i) => addDays(START, i));
  return { journeyStart: START, dates, today: TODAY, ...over };
};

/* ------------------------------------------------------------------ */

describe("weekOf / weekKey", () => {
  it("counts journey-relative weeks, not ISO weeks", () => {
    expect(weekOf(START, START)).toBe(1);
    expect(weekOf(START, addDays(START, 6))).toBe(1);
    expect(weekOf(START, addDays(START, 7))).toBe(2);
  });

  it("pads keys so they sort lexicographically", () => {
    expect([weekKey(10), weekKey(2)].sort()).toEqual([weekKey(2), weekKey(10)]);
  });
});

describe("daily goals", () => {
  it("counts met days over elapsed days", () => {
    // 20 full days elapsed; logged on 5 of them, none today.
    const logs = [0, 1, 2, 3, 4].map((i) => log({ date: addDays(START, i) }));
    const p = buildGoalProgress(goal(), logs, ctx());
    expect(p.unitsDone).toBe(5);
    expect(p.target).toBe(20);
    expect(p.pct).toBe(25);
  });

  // The core "don't invent a 0%" rule.
  it("has a null pct on day one with nothing logged", () => {
    const p = buildGoalProgress(goal({ starts_on: TODAY }), [], ctx());
    expect(p.target).toBeNull();
    expect(p.pct).toBeNull();
  });

  it("counts today only once it has been logged", () => {
    const before = buildGoalProgress(goal({ starts_on: addDays(TODAY, -1) }), [], ctx());
    // Yesterday elapsed and was missed; today untouched and so not yet counted.
    expect(before.target).toBe(1);

    const after = buildGoalProgress(
      goal({ starts_on: addDays(TODAY, -1) }),
      [log({ date: TODAY })],
      ctx(),
    );
    expect(after.target).toBe(2);
    expect(after.unitsDone).toBe(1);
  });

  // starts_on is the whole reason a goal added late is not punished.
  it("ignores days before starts_on", () => {
    const g = goal({ starts_on: addDays(TODAY, -4) });
    const logs = [0, 1, 2, 3].map((i) => log({ date: addDays(addDays(TODAY, -4), i) }));
    const p = buildGoalProgress(g, logs, ctx());
    expect(p.target).toBe(4); // four elapsed days, not twenty
    expect(p.pct).toBe(100);
  });

  it("stops counting once archived", () => {
    const g = goal({ archived_at: `${addDays(START, 10)}T00:00:00.000Z` });
    const p = buildGoalProgress(g, [], ctx());
    expect(p.target).toBe(10);
  });

  it("tracks a day streak", () => {
    const logs = [15, 16, 17, 18, 19].map((i) => log({ date: addDays(START, i) }));
    const p = buildGoalProgress(goal(), logs, ctx());
    expect(p.streak).toEqual({ current: 5, best: 5, unit: "day" });
  });
});

describe("quantified goals", () => {
  const g = goal({ metric: "number", unit: "minutes", target_per_period: 30 });

  it("counts only days that reached the target", () => {
    const logs = [
      log({ date: addDays(START, 0), amount: 30 }),
      log({ date: addDays(START, 1), amount: 10 }),
      log({ date: addDays(START, 2), amount: 45 }),
    ];
    const p = buildGoalProgress(g, logs, ctx());
    expect(p.unitsDone).toBe(2);
  });

  // The old engine counted a null duration as 30 minutes.
  it("never invents an amount that was not recorded", () => {
    const logs = [
      log({ date: addDays(START, 0), amount: null }),
      log({ date: addDays(START, 1), amount: 40 }),
    ];
    const p = buildGoalProgress(g, logs, ctx());
    expect(p.amountTotal).toBe(40);
    expect(p.amountDays).toBe(1);
  });

  it("reports no amount total for a bool goal", () => {
    expect(buildGoalProgress(goal(), [log()], ctx()).amountTotal).toBeNull();
  });
});

describe("weekly goals", () => {
  const g = goal({ cadence: "weekly", target_per_period: 3 });

  it("measures against complete weeks times the target", () => {
    // Weeks 1 and 2 complete (today is day 21, week 3). 3 logs in week 1.
    const logs = [0, 2, 4].map((i) => log({ date: addDays(START, i) }));
    const p = buildGoalProgress(g, logs, ctx());
    expect(p.target).toBe(6); // 2 complete weeks x 3
    expect(p.pct).toBe(50);
  });

  // A full week's target counted on its first day would make Monday look like failure.
  it("keeps the in-flight week out of pct and reports it separately", () => {
    const logs = [log({ date: TODAY })];
    const p = buildGoalProgress(g, logs, ctx());
    expect(p.currentPeriod).toEqual({ done: 1, target: 3 });
    expect(p.target).toBe(6); // unchanged by this week's log
  });

  it("has no denominator without a per-period target", () => {
    const p = buildGoalProgress(goal({ cadence: "weekly" }), [log()], ctx());
    expect(p.target).toBeNull();
    expect(p.pct).toBeNull();
    expect(p.unitsDone).toBe(1);
  });

  it("tracks a week streak, not a day streak", () => {
    // 3 logs in each of weeks 1 and 2 -> both weeks met.
    const logs = [0, 1, 2, 7, 8, 9].map((i) => log({ date: addDays(START, i) }));
    const p = buildGoalProgress(g, logs, ctx());
    expect(p.streak?.unit).toBe("week");
    expect(p.streak?.best).toBe(2);
  });
});

describe("open goals", () => {
  const g = goal({ cadence: "open", target_total: 10 });

  it("counts logs against the total", () => {
    const logs = [1, 2, 3].map(() => log({ slot: null }));
    const p = buildGoalProgress(g, logs, ctx());
    expect(p.unitsDone).toBe(3);
    expect(p.target).toBe(10);
    expect(p.pct).toBe(30);
  });

  it("has no denominator without a total", () => {
    const p = buildGoalProgress(goal({ cadence: "open" }), [log({ slot: null })], ctx());
    expect(p.target).toBeNull();
    expect(p.pct).toBeNull();
    expect(p.unitsDone).toBe(1);
  });

  it("has no streak — there is no rhythm to break", () => {
    expect(buildGoalProgress(g, [log({ slot: null })], ctx()).streak).toBeNull();
  });

  it("caps pct at 100 when the total is exceeded", () => {
    const logs = Array.from({ length: 12 }, () => log({ slot: null }));
    expect(buildGoalProgress(g, logs, ctx()).pct).toBe(100);
  });
});

describe("buildMemberProgress", () => {
  const base = { journeyStart: START, dates: ctx().dates, today: TODAY, daysElapsed: 21 };

  it("shows only journey-wide goals and the member's own", () => {
    const goals = [
      goal({ id: "shared", owner_member_id: null }),
      goal({ id: "mine", owner_member_id: "m1" }),
      goal({ id: "theirs", owner_member_id: "m2" }),
    ];
    const p = buildMemberProgress(member("m1"), goals, [], base);
    expect(p.goals.map((g) => g.goal.id)).toEqual(["shared", "mine"]);
  });

  it("counts distinct logged dates as show-up days", () => {
    const logs = [
      log({ date: addDays(START, 0) }),
      log({ date: addDays(START, 0), goal_id: null, slot: null }), // same day
      log({ date: addDays(START, 1) }),
    ];
    const p = buildMemberProgress(member("m1"), [goal()], logs, base);
    expect(p.activeDays).toBe(2);
    expect(p.momentCount).toBe(1);
  });

  // This is what replaces the hardcoded `* 4`.
  it("measures consistency against the goals actually active that day", () => {
    // Two daily goals, both active from the start. 20 elapsed days, so 40
    // opportunities. Met one goal on 10 days = 10/40.
    const goals = [goal({ id: "a" }), goal({ id: "b" })];
    const logs = Array.from({ length: 10 }, (_, i) => log({ goal_id: "a", date: addDays(START, i) }));
    const p = buildMemberProgress(member("m1"), goals, logs, base);
    expect(p.dailyConsistencyPct).toBe(25);
  });

  it("does not let a goal added today change what earlier days were measured out of", () => {
    const goals = [goal({ id: "a" }), goal({ id: "new", starts_on: TODAY })];
    const logs = Array.from({ length: 10 }, (_, i) => log({ goal_id: "a", date: addDays(START, i) }));
    const p = buildMemberProgress(member("m1"), goals, logs, base);
    // Still 10/20 — the new goal contributes no opportunities for past days,
    // and today is untouched so it does not count either.
    expect(p.dailyConsistencyPct).toBe(50);
  });

  it("returns null consistency when there are no daily goals", () => {
    const p = buildMemberProgress(member("m1"), [goal({ cadence: "open" })], [], base);
    expect(p.dailyConsistencyPct).toBeNull();
  });
});

describe("buildProgress", () => {
  it("treats a solo journey's alive days and together days as the same", () => {
    const logs = [log({ date: addDays(START, 0) }), log({ date: addDays(START, 1) })];
    const p = buildProgress(journey(), [member("m1")], [goal()], logs);
    expect(p.aliveDays).toBe(2);
    expect(p.togetherDays).toBe(2);
  });

  it("counts a day together only when every member logged", () => {
    const logs = [
      log({ member_id: "m1", date: addDays(START, 0) }),
      log({ member_id: "m2", date: addDays(START, 0) }),
      log({ member_id: "m1", date: addDays(START, 1) }), // m2 absent
    ];
    const p = buildProgress(journey({ kind: "shared" }), [member("m1"), member("m2")], [goal()], logs);
    expect(p.aliveDays).toBe(2);
    expect(p.togetherDays).toBe(1);
  });

  it("collects goal-less logs as moments, newest first", () => {
    const logs = [
      log({ goal_id: null, slot: null, date: addDays(START, 0), occurred_at: `${addDays(START, 0)}T08:00:00.000Z`, note: "old" }),
      log({ goal_id: null, slot: null, date: addDays(START, 5), occurred_at: `${addDays(START, 5)}T08:00:00.000Z`, note: "new" }),
    ];
    const p = buildProgress(journey(), [member("m1")], [], logs);
    expect(p.moments.map((m) => m.note)).toEqual(["new", "old"]);
  });

  it("summarises each date for the calendar", () => {
    const goals = [goal({ id: "a" }), goal({ id: "b" })];
    const d = addDays(START, 3);
    const p = buildProgress(journey(), [member("m1")], goals, [log({ goal_id: "a", date: d })]);
    const s = p.byDate.get(d)!;
    expect(s.day).toBe(4);
    expect(s.dailyActive).toBe(2);
    expect(s.dailyMet).toBe(1);
    expect(s.memberIds).toEqual(["m1"]);
  });

  it("clamps the current day to the journey duration", () => {
    const p = buildProgress(journey({ start_date: addDays(TODAY, -500) }), [member("m1")], [], []);
    expect(p.currentDay).toBe(100);
    expect(p.daysElapsed).toBe(100);
  });

  // An untouched today must not read as a miss anywhere.
  it("reports null, not 0%, on a journey starting today with nothing logged", () => {
    const p = buildProgress(journey({ start_date: TODAY }), [member("m1")], [goal()], []);
    expect(p.daysElapsed).toBe(1);
    expect(p.aliveDaysPct).toBeNull();
    expect(p.togetherDaysPct).toBeNull();
    expect(p.members[0]?.showUpPct).toBeNull();
    expect(p.members[0]?.dailyConsistencyPct).toBeNull();
  });

  it("reports 100% once that first day is logged", () => {
    const p = buildProgress(journey({ start_date: TODAY }), [member("m1")], [goal()], [log({ date: TODAY })]);
    expect(p.aliveDaysPct).toBe(100);
    expect(p.members[0]?.showUpPct).toBe(100);
  });

  // A missed yesterday is a real miss and must still count.
  it("counts an elapsed day that was missed", () => {
    const p = buildProgress(journey({ start_date: addDays(TODAY, -1) }), [member("m1")], [goal()], []);
    expect(p.aliveDaysPct).toBe(0);
  });
});

describe("badges", () => {
  it("earns nothing before day 100", () => {
    expect(badgesEarned(99)).toEqual([]);
    expect(nextBadge(99)?.days).toBe(100);
  });

  it("earns The Hundred exactly on day 100", () => {
    expect(badgesEarned(100).map((b) => b.days)).toEqual([100]);
  });

  it("accumulates as the days pass", () => {
    expect(badgesEarned(200).map((b) => b.days)).toEqual([100, 150, 200]);
  });

  it("has no next badge once every threshold is passed", () => {
    expect(nextBadge(365)).toBeNull();
  });

  // currentDay is clamped to duration, so a long duration alone earns nothing.
  it("is not earned by setting a long duration on day one", () => {
    const p = buildProgress(journey({ start_date: TODAY, duration: 365 }), [member("m1")], [], []);
    expect(badgesEarned(p.currentDay)).toEqual([]);
  });
});
