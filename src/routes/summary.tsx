import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/AppShell";
import { ProgressRing } from "@/components/ProgressRing";
import { copy } from "@/lib/copy";
import { MILESTONES, completedCount, formatMinutes, formatMoney, formatShortDate } from "@/lib/challenge";

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
      {({ stats, data, me }) => {
        const done = stats.currentDay >= data.journey.duration;
        const totalWalks = stats.perMember.reduce((s, p) => s + p.walk.days, 0);
        const totalHealthy = stats.perMember.reduce((s, p) => s + p.food.healthyDays + p.food.cheatSundays, 0);
        const t = copy({ kind: data.journey.kind, memberCount: stats.perMember.length });

        return (
          <div className="space-y-5 px-5 pb-8">
            <PageHeader
              title={done ? t.summaryDoneTitle : t.summaryTitle}
              subtitle={
                done
                  ? t.summaryDoneSubtitle
                  : `Day ${stats.currentDay} of ${data.journey.duration} — here's the story so far.`
              }
            />

            <section className="surface flex flex-col items-center gap-4 p-6 sm:flex-row">
              <ProgressRing value={stats.overallPct} size={140} sublabel="Overall completion" />
              <div className="grid flex-1 grid-cols-2 gap-3 text-sm">
                <Stat label="Morning walks" value={`${totalWalks}`} />
                <Stat label="Healthy days" value={`${totalHealthy}`} />
                <Stat label="Money avoided" value={formatMoney(stats.totalSaved)} />
                <Stat label="Certification" value={formatMinutes(stats.totalStudyMinutes)} />
                <Stat label={t.bestStreakLabel} value={`${stats.journeyStreak.best} days`} />
                <Stat label={t.perfectDaysLabel} value={`${stats.completedDaysTogether}`} />
              </div>
            </section>

            <section className="grid gap-4 sm:grid-cols-2">
              {stats.perMember.map((p) => (
                <div key={p.member.id} className="surface p-5">
                  <h2 className="text-lg">
                    {p.member.name}
                    {p.member.id === me.id ? " (you)" : ""}
                  </h2>
                  <div className="mt-3 space-y-1.5 text-sm">
                    <Row label="Completion" value={`${p.completionPct}%`} />
                    <Row label="Walks" value={`${p.walk.days} days`} />
                    <Row label="Healthy days" value={`${p.food.healthyDays + p.food.cheatSundays}`} />
                    <Row label="Study time" value={formatMinutes(p.certification.minutes)} />
                    <Row label="Money avoided" value={formatMoney(p.saved)} />
                    <Row label="Best streak" value={`${p.streak.best} days`} />
                  </div>
                </div>
              ))}
            </section>

            <section className="surface p-5">
              <h2 className="text-lg">{t.timelineTitle}</h2>
              <ol className="mt-4 space-y-4 border-l border-border pl-5">
                {MILESTONES.filter((m) => m <= data.journey.duration).map((m) => {
                  const iso = stats.dates[m - 1]!;
                  const reached = stats.currentDay >= m;
                  const perfect = stats.perMember.every(
                    (p) => completedCount(p.entriesByDate.get(iso)) === 4,
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
                            : "Milestone reached — every day counted."
                          : "Coming up."}
                      </p>
                    </li>
                  );
                })}
              </ol>
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
