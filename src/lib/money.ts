/**
 * Avoided-expense reporting.
 *
 * Lifted verbatim out of stats.ts when the four-habit engine was deleted in
 * P4. Savings were never part of that engine's habit arithmetic — they have
 * their own table and their own screen — so they outlive it unchanged.
 */

import type { AvoidedExpense } from "./challenge";

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
