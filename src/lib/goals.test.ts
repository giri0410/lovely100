import { describe, expect, it } from "vitest";
import {
  categoryMeta,
  goalsForMember,
  isActive,
  logMeetsTarget,
  parseTemplateGoals,
  targetLabel,
  type Goal,
  type Log,
} from "./goals";

function goal(over: Partial<Goal> = {}): Goal {
  return {
    id: "g1",
    journey_id: "j1",
    owner_member_id: null,
    category: "health",
    title: "Morning Walk",
    icon: "🚶",
    color: null,
    cadence: "daily",
    metric: "bool",
    unit: null,
    target_per_period: null,
    target_total: null,
    starts_on: "2026-08-01",
    sort_order: 1,
    archived_at: null,
    ...over,
  };
}

function log(over: Partial<Log> = {}): Log {
  return {
    id: "l1",
    journey_id: "j1",
    member_id: "m1",
    goal_id: "g1",
    date: "2026-08-10",
    occurred_at: "2026-08-10T07:00:00Z",
    slot: "2026-08-10",
    done: true,
    amount: null,
    note: null,
    place: null,
    ...over,
  };
}

describe("isActive", () => {
  it("treats an archived goal as inactive", () => {
    expect(isActive(goal({ archived_at: "2026-08-05T00:00:00Z" }))).toBe(false);
  });

  it("is inactive before starts_on", () => {
    expect(isActive(goal({ starts_on: "2026-08-10" }), "2026-08-09")).toBe(false);
  });

  it("is active on starts_on itself", () => {
    expect(isActive(goal({ starts_on: "2026-08-10" }), "2026-08-10")).toBe(true);
  });
});

describe("goalsForMember", () => {
  const shared = goal({ id: "shared", owner_member_id: null });
  const mine = goal({ id: "mine", owner_member_id: "m1" });
  const theirs = goal({ id: "theirs", owner_member_id: "m2" });

  it("includes journey-wide goals and my own, never someone else's", () => {
    const got = goalsForMember([shared, mine, theirs], "m1").map((g) => g.id);
    expect(got).toEqual(["shared", "mine"]);
  });
});

describe("logMeetsTarget", () => {
  it("a bool goal is met by the log existing", () => {
    expect(logMeetsTarget(goal(), log())).toBe(true);
  });

  it("is not met when the log says not done", () => {
    expect(logMeetsTarget(goal(), log({ done: false }))).toBe(false);
  });

  // The distinction that matters: partial progress is not completion.
  it("a quantified goal short of its target is not met", () => {
    const g = goal({ metric: "number", unit: "minutes", target_per_period: 30 });
    expect(logMeetsTarget(g, log({ amount: 10 }))).toBe(false);
  });

  it("a quantified goal at its target is met", () => {
    const g = goal({ metric: "number", unit: "minutes", target_per_period: 30 });
    expect(logMeetsTarget(g, log({ amount: 30 }))).toBe(true);
  });

  it("a quantified goal with no amount recorded is not met", () => {
    const g = goal({ metric: "number", target_per_period: 30 });
    expect(logMeetsTarget(g, log({ amount: null }))).toBe(false);
  });

  // A quantified goal with no target is "did you do it", not "how much".
  it("a quantified goal with no target is met by the log existing", () => {
    const g = goal({ metric: "number", unit: "minutes", target_per_period: null });
    expect(logMeetsTarget(g, log({ amount: null }))).toBe(true);
  });
});

describe("targetLabel", () => {
  it("returns null when there is no target to describe", () => {
    expect(targetLabel(goal())).toBeNull();
  });

  it("describes a quantified daily target", () => {
    expect(targetLabel(goal({ metric: "number", unit: "minutes", target_per_period: 30 })))
      .toBe("30 minutes a day");
  });

  it("describes a weekly count", () => {
    expect(targetLabel(goal({ cadence: "weekly", target_per_period: 3 }))).toBe("3x a week");
  });

  it("says 'once a week' rather than '1x a week'", () => {
    expect(targetLabel(goal({ cadence: "weekly", target_per_period: 1 }))).toBe("once a week");
  });

  it("describes an open goal's total", () => {
    expect(targetLabel(goal({ cadence: "open", target_total: 10 }))).toBe("10 total");
  });
});

describe("categoryMeta", () => {
  it("resolves a known category", () => {
    expect(categoryMeta("cooking").label).toBe("Cooking & food");
  });

  // category is free text in the DB, so unknown values must not break a screen.
  it("falls back for an unknown category rather than throwing", () => {
    expect(categoryMeta("gardening").label).toBe("Other");
  });
});

describe("parseTemplateGoals", () => {
  it("returns [] for anything that is not an array", () => {
    expect(parseTemplateGoals(null)).toEqual([]);
    expect(parseTemplateGoals({})).toEqual([]);
    expect(parseTemplateGoals("nope")).toEqual([]);
  });

  it("parses a well-formed entry", () => {
    expect(
      parseTemplateGoals([
        { title: "Walk", icon: "🚶", category: "health", cadence: "daily", metric: "number", unit: "minutes", target_per_period: 30 },
      ]),
    ).toEqual([
      { title: "Walk", cadence: "daily", metric: "number", icon: "🚶", category: "health", unit: "minutes", target_per_period: 30 },
    ]);
  });

  // Without this a malformed row becomes a goal literally titled "undefined".
  it("drops entries with no usable title", () => {
    expect(parseTemplateGoals([{ icon: "x" }, { title: "   " }, { title: 5 }, "str", null])).toEqual([]);
  });

  it("falls back to defaults for an unrecognised cadence or metric", () => {
    expect(parseTemplateGoals([{ title: "X", cadence: "hourly", metric: "vibes" }])).toEqual([
      { title: "X", cadence: "daily", metric: "bool" },
    ]);
  });

  // These mirror the CHECK constraints, so a bad template fails here rather
  // than as a rejected insert the user sees.
  it("drops target_total on a non-open goal", () => {
    const [g] = parseTemplateGoals([{ title: "X", cadence: "daily", target_total: 10 }]);
    expect(g?.target_total).toBeUndefined();
  });

  it("drops target_per_period on an open goal", () => {
    const [g] = parseTemplateGoals([{ title: "X", cadence: "open", target_per_period: 3 }]);
    expect(g?.target_per_period).toBeUndefined();
  });

  it("drops a unit on a bool goal", () => {
    const [g] = parseTemplateGoals([{ title: "X", metric: "bool", unit: "minutes" }]);
    expect(g?.unit).toBeUndefined();
  });

  it("rejects non-positive and non-integer targets", () => {
    const [a] = parseTemplateGoals([{ title: "A", cadence: "open", target_total: 0 }]);
    const [b] = parseTemplateGoals([{ title: "B", cadence: "open", target_total: -5 }]);
    const [c] = parseTemplateGoals([{ title: "C", cadence: "open", target_total: "10" }]);
    const [d] = parseTemplateGoals([{ title: "D", cadence: "open", target_total: 7.9 }]);
    expect([a?.target_total, b?.target_total, c?.target_total]).toEqual([undefined, undefined, undefined]);
    expect(d?.target_total).toBe(7);
  });

  it("keeps the good entries and drops only the bad ones", () => {
    const got = parseTemplateGoals([{ title: "Keep" }, { nope: 1 }, { title: "Also" }]);
    expect(got.map((g) => g.title)).toEqual(["Keep", "Also"]);
  });
});
