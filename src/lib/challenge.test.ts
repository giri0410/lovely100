import { describe, expect, it } from "vitest";
import {
  addDays,
  completedCount,
  computeStreak,
  dateForDay,
  dayNumber,
  dayStatus,
  formatMinutes,
  formatMoney,
  isSunday,
  parseISO,
  toISO,
  weekNumberForDay,
  type DailyHabit,
} from "./challenge";

/** A day with every habit unchecked; spread over it to switch individual ones on. */
function entry(patch: Partial<DailyHabit> = {}): DailyHabit {
  return {
    id: "e",
    couple_id: "c",
    profile_id: "p",
    date: "2026-01-01",
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

const allFour = {
  walk_completed: true,
  healthy_food_completed: true,
  unnecessary_spending_completed: true,
  certification_completed: true,
};

describe("dates", () => {
  it("round-trips through toISO and parseISO in local time", () => {
    const iso = "2026-03-15";
    expect(toISO(parseISO(iso))).toBe(iso);
  });

  it("crosses month and year boundaries", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("handles a leap day", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("counts the start date as day 1, not day 0", () => {
    expect(dayNumber("2026-01-01", "2026-01-01")).toBe(1);
    expect(dayNumber("2026-01-01", "2026-01-10")).toBe(10);
  });

  it("treats dateForDay as the inverse of dayNumber", () => {
    const start = "2026-04-10";
    for (const day of [1, 2, 47, 100]) {
      expect(dayNumber(start, dateForDay(start, day))).toBe(day);
    }
  });

  it("spans exactly 100 days from day 1 to day 100", () => {
    expect(dateForDay("2026-01-01", 100)).toBe("2026-04-10");
  });

  it("identifies Sundays", () => {
    expect(isSunday("2026-08-23")).toBe(true);
    expect(isSunday("2026-08-24")).toBe(false);
  });

  it("groups days into 7-day weeks", () => {
    expect(weekNumberForDay(1)).toBe(1);
    expect(weekNumberForDay(7)).toBe(1);
    expect(weekNumberForDay(8)).toBe(2);
    expect(weekNumberForDay(100)).toBe(15);
  });
});

describe("formatting", () => {
  it("formats rupees with Indian digit grouping", () => {
    // India-only is a settled product decision, so this is intended behaviour.
    expect(formatMoney(1200)).toBe("₹1,200");
    expect(formatMoney(100000)).toBe("₹1,00,000");
    expect(formatMoney(0)).toBe("₹0");
  });

  it("rounds fractional amounts", () => {
    expect(formatMoney(99.4)).toBe("₹99");
    expect(formatMoney(99.6)).toBe("₹100");
  });

  it("formats durations without a zero minute component", () => {
    expect(formatMinutes(0)).toBe("0m");
    expect(formatMinutes(45)).toBe("45m");
    expect(formatMinutes(120)).toBe("2h");
    expect(formatMinutes(150)).toBe("2h 30m");
  });
});

describe("completedCount", () => {
  it("is 0 for a missing entry", () => {
    expect(completedCount(null)).toBe(0);
    expect(completedCount(undefined)).toBe(0);
  });

  it("counts only the four habit columns", () => {
    expect(completedCount(entry())).toBe(0);
    expect(completedCount(entry({ walk_completed: true }))).toBe(1);
    expect(completedCount(entry(allFour))).toBe(4);
  });

  it("ignores detail fields that aren't habit checkboxes", () => {
    expect(completedCount(entry({ walk_duration: 45, certification_minutes: 60 }))).toBe(0);
  });
});

describe("dayStatus", () => {
  const today = "2026-05-10";

  it("marks unreached days as future", () => {
    expect(dayStatus(0, "2026-05-11", today)).toBe("future");
  });

  it("marks a full past day completed and a partial one partial", () => {
    expect(dayStatus(4, "2026-05-09", today)).toBe("completed");
    expect(dayStatus(2, "2026-05-09", today)).toBe("partial");
    expect(dayStatus(0, "2026-05-09", today)).toBe("missed");
  });

  it("shows a finished today as completed, not merely as today", () => {
    expect(dayStatus(4, today, today)).toBe("completed");
  });

  it("shows a part-done today by its progress", () => {
    expect(dayStatus(2, today, today)).toBe("partial");
  });

  it("keeps an untouched today as 'today' rather than missed", () => {
    // The day isn't over, so it hasn't been missed.
    expect(dayStatus(0, today, today)).toBe("today");
  });
});

describe("computeStreak", () => {
  const dates = ["2026-05-01", "2026-05-02", "2026-05-03", "2026-05-04", "2026-05-05"];
  const doneOn = (set: string[]) => (iso: string) => set.includes(iso);

  it("is all zeroes with nothing done", () => {
    expect(computeStreak(dates, () => false, "2026-05-05")).toEqual({ current: 0, best: 0 });
  });

  it("counts a run that reaches today as both current and best", () => {
    expect(computeStreak(dates, () => true, "2026-05-05")).toEqual({ current: 5, best: 5 });
  });

  it("does not let an unfinished today break the current streak", () => {
    // The day isn't over yet, so it shouldn't count against you.
    const done = doneOn(["2026-05-03", "2026-05-04"]);
    expect(computeStreak(dates, done, "2026-05-05")).toEqual({ current: 2, best: 2 });
  });

  it("does break the current streak on a missed day that has passed", () => {
    const done = doneOn(["2026-05-01", "2026-05-02", "2026-05-03"]);
    expect(computeStreak(dates, done, "2026-05-05")).toEqual({ current: 0, best: 3 });
  });

  it("remembers the best run after a gap", () => {
    const done = doneOn(["2026-05-01", "2026-05-02", "2026-05-03", "2026-05-05"]);
    expect(computeStreak(dates, done, "2026-05-05")).toEqual({ current: 1, best: 3 });
  });

  it("ignores future days when computing the best run", () => {
    // Everything is "done", but only the first two days have happened.
    expect(computeStreak(dates, () => true, "2026-05-02")).toEqual({ current: 2, best: 2 });
  });
});
