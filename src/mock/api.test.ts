/**
 * Behaviour tests against the mock backend.
 *
 * These exist because the mock is the only backend a test can drive, and
 * because the rules they cover (template de-duplication, the slot upsert) are
 * shared with the real one — a divergence here is a bug there too.
 */
import { beforeEach, describe, expect, it } from "vitest";
import * as api from "./api";
import { createSeedDatabase } from "./seed";

const JOURNEY = createSeedDatabase().journeys[0]!.id;
const MEMBER = createSeedDatabase().members[0]!.id;

beforeEach(() => {
  api.resetMockDatabase();
});

describe("applyGoalTemplate", () => {
  it("adds a template's goals when the journey holds none of them", async () => {
    // Deliberately not original-four: the seed already holds those, which is
    // the whole point of the next test.
    const tpl = (await api.listGoalTemplates()).find((t) => t.slug === "places")!;
    const before = (await api.listGoals(JOURNEY)).length;
    const r = await api.applyGoalTemplate({ journeyId: JOURNEY, ownerMemberId: null, template: tpl });
    expect(r).toEqual({ added: tpl.goals.length, skipped: 0 });
    expect((await api.listGoals(JOURNEY)).length).toBe(before + tpl.goals.length);
  });

  // The production bug: the seed already holds the original four, so adding
  // that template again used to duplicate every one of them.
  it("skips goals the journey already has, rather than duplicating them", async () => {
    const tpl = (await api.listGoalTemplates()).find((t) => t.slug === "original-four")!;
    const before = await api.listGoals(JOURNEY);
    expect(before.map((g) => g.title)).toContain("Morning Walk");

    const r = await api.applyGoalTemplate({ journeyId: JOURNEY, ownerMemberId: null, template: tpl });
    expect(r.added).toBe(0);
    expect(r.skipped).toBe(tpl.goals.length);

    const after = await api.listGoals(JOURNEY);
    expect(after.length).toBe(before.length);
    expect(after.filter((g) => g.title === "Morning Walk")).toHaveLength(1);
  });

  it("adds only the goals that are genuinely new", async () => {
    const tpl = (await api.listGoalTemplates()).find((t) => t.slug === "original-four")!;
    // A template overlapping on one title only.
    const mixed = { ...tpl, goals: [tpl.goals[0]!, { title: "Brand New Goal", cadence: "daily" as const }] };
    const r = await api.applyGoalTemplate({ journeyId: JOURNEY, ownerMemberId: null, template: mixed });
    expect(r).toEqual({ added: 1, skipped: 1 });
    expect((await api.listGoals(JOURNEY)).map((g) => g.title)).toContain("Brand New Goal");
  });

  it("matches titles case- and whitespace-insensitively", async () => {
    const tpl = (await api.listGoalTemplates()).find((t) => t.slug === "original-four")!;
    const shouty = { ...tpl, goals: [{ title: "  MORNING WALK  ", cadence: "daily" as const }] };
    const r = await api.applyGoalTemplate({ journeyId: JOURNEY, ownerMemberId: null, template: shouty });
    expect(r).toEqual({ added: 0, skipped: 1 });
  });

  it("does not let an archived goal block re-adding it", async () => {
    const walk = (await api.listGoals(JOURNEY)).find((g) => g.title === "Morning Walk")!;
    await api.archiveGoal(walk.id);
    const tpl = (await api.listGoalTemplates()).find((t) => t.slug === "original-four")!;
    const one = { ...tpl, goals: [{ title: "Morning Walk", cadence: "daily" as const }] };
    // Archiving means "I stopped doing this", so starting again is allowed.
    expect(await api.applyGoalTemplate({ journeyId: JOURNEY, ownerMemberId: null, template: one }))
      .toEqual({ added: 1, skipped: 0 });
  });
});

describe("goal log slot semantics", () => {
  it("upserts a dated goal rather than duplicating it", async () => {
    const goal = (await api.listGoals(JOURNEY)).find((g) => g.cadence === "daily")!;
    for (const amount of [10, 20, 30]) {
      await api.upsertGoalLog({ memberId: MEMBER, goalId: goal.id, date: "2026-09-01", amount });
    }
    const rows = (await api.listLogs(JOURNEY)).filter(
      (l) => l.goal_id === goal.id && l.date === "2026-09-01",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.amount).toBe(30);
  });

  it("lets an open goal accumulate many logs in one day", async () => {
    const open = await api.createGoal({
      journeyId: JOURNEY, ownerMemberId: null, title: "Places", category: "travel",
      cadence: "open", metric: "bool", targetTotal: 10,
    });
    for (const p of ["a", "b", "c"]) {
      await api.addLog({ memberId: MEMBER, goalId: open.id, date: "2026-09-01", place: p });
    }
    const rows = (await api.listLogs(JOURNEY)).filter((l) => l.goal_id === open.id);
    expect(rows).toHaveLength(3);
    expect(rows.every((l) => l.slot === null)).toBe(true);
  });

  it("removes the log when a dated goal is untoggled", async () => {
    const goal = (await api.listGoals(JOURNEY)).find((g) => g.cadence === "daily")!;
    await api.upsertGoalLog({ memberId: MEMBER, goalId: goal.id, date: "2026-09-02" });
    await api.deleteGoalLog({ memberId: MEMBER, goalId: goal.id, date: "2026-09-02" });
    const rows = (await api.listLogs(JOURNEY)).filter(
      (l) => l.goal_id === goal.id && l.date === "2026-09-02",
    );
    expect(rows).toHaveLength(0);
  });
});

describe("archiveGoal", () => {
  it("switches off any reminder for the archived goal", async () => {
    const goal = (await api.listGoals(JOURNEY)).find((g) => g.cadence === "daily")!;
    await api.upsertReminder({ memberId: MEMBER, type: "goal", goalId: goal.id, enabled: true, time: "07:00" });
    expect((await api.listReminders(MEMBER)).find((r) => r.goal_id === goal.id)?.enabled).toBe(true);

    await api.archiveGoal(goal.id);

    // reminders_due refuses to fire on an archived goal, and Settings hides
    // archived goals — so an enabled row here would be invisible and dead.
    const after = (await api.listReminders(MEMBER)).find((r) => r.goal_id === goal.id);
    expect(after?.enabled).toBe(false);
    // Kept, not deleted, so the time survives if the goal comes back.
    expect(after?.reminder_time).toBe("07:00");
  });

  it("leaves other goals' reminders alone", async () => {
    const goals = (await api.listGoals(JOURNEY)).filter((g) => g.cadence === "daily");
    const [a, b] = [goals[0]!, goals[1]!];
    await api.upsertReminder({ memberId: MEMBER, type: "goal", goalId: a.id, enabled: true, time: "07:00" });
    await api.upsertReminder({ memberId: MEMBER, type: "goal", goalId: b.id, enabled: true, time: "08:00" });
    await api.archiveGoal(a.id);
    expect((await api.listReminders(MEMBER)).find((r) => r.goal_id === b.id)?.enabled).toBe(true);
  });
});
