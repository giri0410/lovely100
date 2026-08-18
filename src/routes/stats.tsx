import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/AppShell";
import { ProgressRing } from "@/components/ProgressRing";
import { formatMinutes, formatMoney } from "@/lib/challenge";
import { monthlySavings } from "@/lib/stats";
import type { ProfileStats } from "@/lib/stats";

export const Route = createFileRoute("/stats")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Statistics — 100 Days Together" },
      { name: "description", content: "Habit-by-habit statistics: walks, healthy days, money avoided, study hours and streaks." },
      { property: "og:title", content: "Statistics — 100 Days Together" },
      { property: "og:description", content: "Track walks, healthy eating, mindful spending and study hours." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StatsPage,
});

function StatsPage() {
  return (
    <AppShell>
      {({ stats, data, me }) => {
        const months = monthlySavings(data.expenses);
        const maxMonth = Math.max(1, ...months.map((m) => m.total));
        return (
          <div className="space-y-5 px-5 pb-8">
            <PageHeader title="Our statistics" subtitle="Progress you're building together, never a competition." />

            <section className="surface flex flex-col items-center gap-4 p-5 sm:flex-row">
              <ProgressRing value={stats.teamScore} size={128} sublabel="Team score" />
              <div className="flex-1 space-y-2 text-sm">
                {stats.perProfile.map((p) => (
                  <div key={p.profile.id}>
                    <div className="flex justify-between">
                      <span className="font-medium">
                        {p.profile.name}
                        {p.profile.id === me.id ? " (you)" : ""}
                      </span>
                      <span>{p.completionPct}%</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-secondary">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${p.completionPct}%` }} />
                    </div>
                  </div>
                ))}
                <p className="pt-1 text-muted-foreground">
                  Together: {stats.teamScore}% · 🔥 {stats.coupleStreak.current} day streak (best{" "}
                  {stats.coupleStreak.best})
                </p>
              </div>
            </section>

            {stats.perProfile.map((p) => (
              <PersonStats key={p.profile.id} p={p} isMe={p.profile.id === me.id} />
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

function PersonStats({ p, isMe }: { p: ProfileStats; isMe: boolean }) {
  return (
    <section className="surface p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg">
          {p.profile.name}
          {isMe ? " (you)" : ""}
        </h2>
        <span className="text-sm text-muted-foreground">
          🔥 {p.streak.current} · best {p.streak.best}
        </span>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Block title="🚶 Morning Walk">
          <Row label="Days completed" value={`${p.walk.days} / ${p.daysElapsed}`} />
          <Row label="Completion" value={`${p.walk.pct}%`} />
          <Row label="Current streak" value={`${p.walk.current} days`} />
          <Row label="Longest streak" value={`${p.walk.best} days`} />
        </Block>
        <Block title="🥗 Healthy Food">
          <Row label="Healthy days" value={`${p.food.healthyDays}`} />
          <Row label="Cheat Sundays" value={`${p.food.cheatSundays}`} />
          <Row label="Diet consistency" value={`${p.food.pct}%`} />
        </Block>
        <Block title="💸 Financial Discipline">
          <Row label="Purchases avoided" value={`${p.savedCount}`} />
          <Row label="Money avoided" value={formatMoney(p.saved)} />
        </Block>
        <Block title="📘 Certification">
          <Row label="Total study time" value={formatMinutes(p.certification.minutes)} />
          <Row label="Days studied" value={`${p.certification.days}`} />
          <Row label="Average session" value={formatMinutes(p.certification.avg)} />
          <Row label="Longest streak" value={`${p.certification.best} days`} />
        </Block>
      </div>
    </section>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-secondary/50 p-4">
      <p className="text-sm font-semibold">{title}</p>
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
