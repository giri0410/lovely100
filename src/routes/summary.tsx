import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/AppShell";
import { ProgressRing } from "@/components/ProgressRing";
import { badgesEarned, nextBadge } from "@/lib/progress";
import { MILESTONES, formatMoney, formatShortDate } from "@/lib/challenge";

export const Route = createFileRoute("/summary")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "The whole story — Lovely 100" },
      { name: "description", content: "The final report of your 100-day challenge: walks, healthy days, money avoided, study hours and streaks." },
      { property: "og:title", content: "The whole story — Lovely 100" },
      { property: "og:description", content: "A side-by-side look at everything you built together." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SummaryPage,
});

function SummaryPage() {
  return (
    <AppShell>
      {({ progress, data, me, t }) => {
        const done = progress.currentDay >= data.journey.duration;
        const savedTotal = data.expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
        const totalLogs = data.logs.filter((l) => l.goal_id !== null).length;
        // Days where every goal that was running got done. Not togetherDays,
        // which counts days somebody logged anything at all — labelling that
        // "perfect days" claimed a completion nobody achieved, and contradicted
        // the calendar's own grid.
        const perfectDays = progress.dates.filter((d) => {
          if (d > progress.today) return false;
          const s = progress.byDate.get(d);
          return Boolean(s && s.dailyActive > 0 && s.dailyMet >= s.dailyActive);
        }).length;

        const earned = badgesEarned(progress.currentDay);
        const upcoming = nextBadge(progress.currentDay);

        return (
          <div className="space-y-5 px-5 pb-8">
            <PageHeader
              title={done ? t.summaryDoneTitle : t.summaryTitle}
              subtitle={
                done
                  ? t.summaryDoneSubtitle
                  : `Day ${progress.currentDay} of ${data.journey.duration} — here's the story so far.`
              }
            />

            <section className="surface flex flex-col items-center gap-4 p-6 sm:flex-row">
              <ProgressRing
                value={(t.together ? progress.togetherDaysPct : progress.members[0]?.showUpPct) ?? 0}
                size={140}
                sublabel={t.showUpLabel}
              />
              <div className="grid flex-1 grid-cols-2 gap-3 text-sm">
                <Stat label="Days shown up" value={`${t.together ? progress.togetherDays : progress.aliveDays}`} />
                <Stat label="Things logged" value={`${totalLogs}`} />
                <Stat label="Memories kept" value={`${progress.moments.length}`} />
                <Stat label="Money avoided" value={formatMoney(savedTotal)} />
                <Stat label={t.bestStreakLabel} value={`${progress.togetherStreak.best} days`} />
                <Stat label={t.perfectDaysLabel} value={`${perfectDays}`} />
              </div>
            </section>

            <section className="grid gap-4 sm:grid-cols-2">
              {progress.members.map((p) => (
                <div key={p.member.id} className="surface p-5">
                  <h2 className="text-lg">
                    {p.member.name}
                    {p.member.id === me.id ? " (you)" : ""}
                  </h2>
                  <div className="mt-3 space-y-1.5 text-sm">
                    <Row label="Days shown up" value={`${p.activeDays}`} />
                    {p.dailyConsistencyPct !== null ? (
                      <Row label="Consistency" value={`${p.dailyConsistencyPct}%`} />
                    ) : null}
                    <Row label="Best streak" value={`${p.showUpStreak.best} days`} />
                    <Row label="Memories" value={`${p.momentCount}`} />
                    <Row
                      label="Money avoided"
                      value={formatMoney(
                        data.expenses
                          .filter((e) => e.member_id === p.member.id)
                          .reduce((sum, e) => sum + Number(e.amount || 0), 0),
                      )}
                    />
                  </div>
                  {/* Each goal on its own terms — a count where there is no
                      honest denominator. */}
                  <ul className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
                    {p.goals
                      .filter((g) => !g.goal.archived_at)
                      .map((g) => (
                        <li key={g.goal.id} className="flex justify-between">
                          <span className="text-muted-foreground">
                            {g.goal.icon ? `${g.goal.icon} ` : ""}
                            {g.goal.title}
                          </span>
                          <span className="font-medium">
                            {g.pct !== null ? `${g.pct}%` : `${g.unitsDone}`}
                          </span>
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </section>

            <section className="surface p-5">
              <h2 className="text-lg">{t.timelineTitle}</h2>
              <ol className="mt-4 space-y-4 border-l border-border pl-5">
                {MILESTONES.filter((m) => m <= data.journey.duration).map((m) => {
                  const iso = progress.dates[m - 1]!;
                  const reached = progress.currentDay >= m;
                  const summary = progress.byDate.get(iso);
                  // "Perfect" now means every goal that was running that day,
                  // not four of four.
                  const perfect = Boolean(
                    summary && summary.dailyActive > 0 && summary.dailyMet >= summary.dailyActive,
                  );
                  return (
                    <li key={m} className="relative text-sm">
                      <span
                        className={`absolute -left-[27px] top-1 size-3 rounded-full border-2 ${
                          reached ? "border-primary bg-primary" : "border-border bg-background"
                        }`}
                      />
                      <p className="font-medium">
                        Day {m} · {formatShortDate(iso)}
                      </p>
                      <p className="text-muted-foreground">
                        {reached
                          ? perfect
                            ? "🎉 Milestone reached with a perfect day."
                            : "Milestone reached."
                          : "Coming up."}
                      </p>
                    </li>
                  );
                })}
              </ol>
            </section>

            <section className="surface p-5">
              <h2 className="text-lg">Badges</h2>
              <p className="text-sm text-muted-foreground">
                Earned by reaching the day, not by planning to. Extend your journey to unlock the next one.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {earned.length === 0 ? (
                  <p className="text-sm text-muted-foreground">None yet — the first arrives at day 100.</p>
                ) : (
                  earned.map((b) => (
                    <span
                      key={b.days}
                      className="rounded-full border border-primary/40 bg-primary/5 px-3 py-1.5 text-sm font-medium"
                    >
                      {b.emoji} {b.label}
                    </span>
                  ))
                )}
              </div>
              {upcoming ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  Next: {upcoming.emoji} {upcoming.label} at day {upcoming.days} —{" "}
                  {upcoming.days - progress.currentDay} to go.
                </p>
              ) : null}
            </section>
          </div>
        );
      }}
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-secondary/60 px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="font-semibold">{value}</p>
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
