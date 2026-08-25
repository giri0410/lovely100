import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/AppShell";
import { ProgressRing } from "@/components/ProgressRing";
import { formatMinutes, formatMoney } from "@/lib/challenge";
import { monthlySavings } from "@/lib/money";
import { categoryMeta, targetLabel } from "@/lib/goals";
import type { MemberProgress } from "@/lib/progress";

export const Route = createFileRoute("/stats")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Statistics — Lovely 100" },
      { name: "description", content: "Goal-by-goal statistics: streaks, consistency, money avoided and study hours." },
      { property: "og:title", content: "Statistics — Lovely 100" },
      { property: "og:description", content: "See how your 100 days are going." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StatsPage,
});

function StatsPage() {
  return (
    <AppShell>
      {({ progress, data, me, t }) => {
        const months = monthlySavings(data.expenses);
        const maxMonth = Math.max(1, ...months.map((m) => m.total));
        const expensesFor = (memberId: string) =>
          data.expenses.filter((e) => e.member_id === memberId);
        return (
          <div className="space-y-5 px-5 pb-8">
            <PageHeader title={t.statsTitle} subtitle={t.statsSubtitle} />

            <section className="surface flex flex-col items-center gap-4 p-5 sm:flex-row">
              {/* The ring shows days shown up, which is defined for every mix
                  of goals. Consistency percentages are per-goal and live below. */}
              <ProgressRing
                value={(t.together ? progress.togetherDaysPct : progress.members[0]?.showUpPct) ?? 0}
                size={128}
                sublabel={t.showUpLabel}
              />
              <div className="flex-1 space-y-2 text-sm">
                {/* With one member this list is a single bar, and the summary
                    line below drops the "together" framing entirely — the score
                    is that person's own consistency, so say so. */}
                {progress.members.map((p) => (
                  <div key={p.member.id}>
                    <div className="flex justify-between">
                      <span className="font-medium">
                        {p.member.name}
                        {p.member.id === me.id ? " (you)" : ""}
                      </span>
                      {/* A count, not a fabricated 0%, before any day elapses. */}
                      <span>{p.showUpPct === null ? `${p.activeDays} days` : `${p.showUpPct}%`}</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${p.showUpPct ?? 0}%` }}
                      />
                    </div>
                  </div>
                ))}
                <p className="pt-1 text-muted-foreground">
                  {t.together ? `Both showed up: ${progress.togetherDays} days · ` : ""}🔥{" "}
                  {progress.members.find((m) => m.member.id === me.id)?.showUpStreak.current ?? 0} day streak (best{" "}
                  {progress.members.find((m) => m.member.id === me.id)?.showUpStreak.best ?? 0})
                </p>
                {t.inviteNudge ? <p className="text-xs text-muted-foreground">{t.inviteNudge}</p> : null}
              </div>
            </section>

            {progress.members.map((p) => (
              <PersonStats
                key={p.member.id}
                p={p}
                isMe={p.member.id === me.id}
                savedCount={expensesFor(p.member.id).length}
                saved={expensesFor(p.member.id).reduce((sum, e) => sum + Number(e.amount || 0), 0)}
              />
            ))}

            <section className="surface p-5">
              <h2 className="text-lg">Monthly money avoided</h2>
              <p className="text-sm text-muted-foreground">
                Potential money saved by avoiding unnecessary purchases.
              </p>
              <div className="mt-4 space-y-2">
                {months.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing logged yet — add your first avoided expense.</p>
                ) : (
                  months.map((m) => (
                    <div key={m.label}>
                      <div className="flex justify-between text-sm">
                        <span>{m.label}</span>
                        <span className="font-medium">{formatMoney(m.total)}</span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full rounded-full bg-success"
                          style={{ width: `${(m.total / maxMonth) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <div className="flex flex-wrap gap-3">
              <Link to="/review" className="rounded-xl border border-input px-4 py-2.5 text-sm font-medium">
                Weekly review
              </Link>
              <Link to="/summary" className="rounded-xl border border-input px-4 py-2.5 text-sm font-medium">
                100-day summary
              </Link>
            </div>
          </div>
        );
      }}
    </AppShell>
  );
}

/**
 * One member's goals, each measured on its own terms.
 *
 * The old version had four hardcoded <Block>s — walk, food, spending,
 * certification — with the label list duplicated from HABITS. Goals render
 * themselves now, and a goal with no honest denominator shows a count rather
 * than a percentage.
 */
function PersonStats({
  p,
  isMe,
  savedCount,
  saved,
}: {
  p: MemberProgress;
  isMe: boolean;
  savedCount: number;
  saved: number;
}) {
  const active = p.goals.filter((g) => !g.goal.archived_at);

  return (
    <section className="surface p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg">
          {p.member.name}
          {isMe ? " (you)" : ""}
        </h2>
        <span className="text-sm text-muted-foreground">
          🔥 {p.showUpStreak.current} · best {p.showUpStreak.best}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-3 text-sm text-muted-foreground">
        <span>{p.activeDays} days shown up</span>
        {p.dailyConsistencyPct !== null ? <span>· {p.dailyConsistencyPct}% consistency</span> : null}
        {p.momentCount > 0 ? <span>· {p.momentCount} memories</span> : null}
      </div>

      {active.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No goals set yet.</p>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {active.map((g) => (
            <Block
              key={g.goal.id}
              title={`${g.goal.icon ? `${g.goal.icon} ` : ""}${g.goal.title}`}
              subtitle={`${categoryMeta(g.goal.category).label}${
                targetLabel(g.goal) ? ` · ${targetLabel(g.goal)}` : ""
              }`}
            >
              {g.goal.cadence === "open" ? (
                <Row
                  label="Added"
                  value={g.target ? `${g.unitsDone} / ${g.target}` : `${g.unitsDone}`}
                />
              ) : (
                <Row
                  label={g.goal.cadence === "weekly" ? "Times logged" : "Days completed"}
                  value={g.target ? `${g.unitsDone} / ${g.target}` : `${g.unitsDone}`}
                />
              )}
              {/* Only shown when a denominator exists — see progress.ts. */}
              {g.pct !== null ? <Row label="Completion" value={`${g.pct}%`} /> : null}
              {g.streak ? (
                <Row
                  label="Longest streak"
                  value={`${g.streak.best} ${g.streak.unit}${g.streak.best === 1 ? "" : "s"}`}
                />
              ) : null}
              {/* Totals only over days that actually carried a number. */}
              {g.amountTotal !== null && g.amountDays > 0 ? (
                <>
                  <Row
                    label="Total"
                    value={`${g.amountTotal}${g.goal.unit ? ` ${g.goal.unit}` : ""}`}
                  />
                  <Row
                    label="Average"
                    value={`${Math.round(g.amountTotal / g.amountDays)}${
                      g.goal.unit ? ` ${g.goal.unit}` : ""
                    } over ${g.amountDays} ${g.amountDays === 1 ? "day" : "days"}`}
                  />
                </>
              ) : null}
              {g.lastLoggedDate ? <Row label="Last logged" value={g.lastLoggedDate} /> : null}
            </Block>
          ))}

          <Block title="💸 Money avoided" subtitle="Purchases you chose not to make">
            <Row label="Purchases avoided" value={`${savedCount}`} />
            <Row label="Money avoided" value={formatMoney(saved)} />
          </Block>
        </div>
      )}
    </section>
  );
}

function Block({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl bg-secondary/50 p-4">
      <p className="text-sm font-semibold">{title}</p>
      {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
      <div className="mt-2 space-y-1 text-sm">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
