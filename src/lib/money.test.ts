import { describe, expect, it } from "vitest";
import type { AvoidedExpense } from "./challenge";
import { monthlySavings } from "./money";

describe("monthlySavings", () => {
  const row = (date: string, amount: number): AvoidedExpense => ({
    id: date + amount,
    member_id: "p1",
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
