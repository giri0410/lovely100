import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell, PageHeader } from "@/components/AppShell";
import {
  BarList,
  ChartFrame,
  ColumnChart,
  DataTable,
  Legend,
  LineChart,
  SERIES,
  StatTile,
} from "@/components/charts";
import {
  categoryTotals,
  dayOfWeekPattern,
  goalBars,
  momentum,
  weeklyShowUp,
} from "@/lib/analytics";
import { categoryMeta } from "@/lib/goals";
import type { ChallengeData } from "@/hooks/useChallenge";
import type { JourneyProgress } from "@/lib/progress";
import type { Copy } from "@/lib/copy";
import type { Member } from "@/lib/challenge";

export const Route = createFileRoute("/analytics")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Analytics — Lovely 100" },
      { name: "description", content: "Where your hundred days actually go: consistency, goals, weekday patterns." },
      { property: "og:title", content: "Analytics — Lovely 100" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  return (
    <AppShell>
      {({ me, data, progress, t }) => (
        <AnalyticsView me={me} data={data} progress={progress} t={t} />
      )}
    </AppShell>
  );
}

function AnalyticsView({
  me,
  data,
  progress,
  t,
}: {
  me: Member;
  data: ChallengeData;
  progress: JourneyProgress;
  t: Copy;
}) {
  // In a shared journey you can look at either person's numbers. Defaults to
  // your own — this is a mirror first and a comparison second, and never a
  // leaderboard.
  const [whoId, setWhoId] = useState(me.id);
  const who = progress.members.find((m) => m.member.id === whoId) ?? progress.members[0];

  if (!who) {
    return (
      <div className="px-5 pb-8">
        <PageHeader title="Analytics" subtitle="Nothing to analyse yet." />
      </div>
    );
  }

  const weeks = weeklyShowUp(progress, who.member.id);
  const bars = goalBars(who);
  const dows = dayOfWeekPattern(progress, who.member.id);
  const cats = categoryTotals(data.goals, data.logs, who.member.id);
  const mo = momentum(progress, who.member.id);

  const catMax = Math.max(1, ...cats.map((c) => c.logs));
  const bestDay = [...dows].filter((d) => d.pct !== null).sort((a, b) => b.pct! - a.pct!)[0];
  const worstDay = [...dows].filter((d) => d.pct !== null && d.occurrences > 1).sort((a, b) => a.pct! - b.pct!)[0];

  return (
    <div className="space-y-5 px-5 pb-8">
      <PageHeader
        title="Analytics"
        subtitle="Where your hundred days actually go. Every number here has a stated denominator."
      />

      {progress.members.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {progress.members.map((m) => (
            <button
              key={m.member.id}
              type="button"
              onClick={() => setWhoId(m.member.id)}
              aria-pressed={m.member.id === whoId}
              className={
                m.member.id === whoId
                  ? "rounded-full bg-primary px-3.5 py-1.5 text-small font-medium text-primary-foreground"
                  : "rounded-full border border-input px-3.5 py-1.5 text-small"
              }
            >
              {m.member.name}
              {m.member.id === me.id ? " (you)" : ""}
            </button>
          ))}
        </div>
      ) : null}

      {/* Headline numbers are tiles, not charts — a single value does not need
          axes to be understood. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="Days shown up"
          value={`${who.activeDays}`}
          sub={`of ${progress.daysElapsed} elapsed`}
        />
        <StatTile
          label="Last 7 days"
          value={`${mo.recent}%`}
          delta={mo.delta}
        />
        <StatTile
          label="Current streak"
          value={`${who.showUpStreak.current}`}
          sub={`best ${who.showUpStreak.best}`}
        />
        <StatTile
          label="Memories"
          value={`${who.momentCount}`}
          {...(t.together ? { sub: `${progress.moments.length} in the journey` } : {})}
        />
      </div>

      <ChartFrame
        title="Consistency, week by week"
        hint="Days you logged something, over the days of that week that have happened. The last point is hollow while the week is still running."
        table={
          <DataTable
            head={["Week", "Days shown up", "Days elapsed", "Rate"]}
            rows={weeks.map((w) => [w.label, w.daysShownUp, w.daysElapsed, w.pct === null ? "—" : `${w.pct}%`])}
          />
        }
      >
        <LineChart
          points={weeks.map((w) => ({ label: w.label, value: w.pct, partial: !w.complete }))}
          colorIndex={0}
        />
      </ChartFrame>

      <ChartFrame
        title="How each goal is going"
        hint="Goals with a target show a percentage. The rest show a count — there is no denominator to divide by, so inventing one would be a lie."
        table={
          <DataTable
            head={["Goal", "Done", "Target", "Rate"]}
            rows={bars.map((b) => [
              b.title,
              b.done,
              b.target ?? "—",
              b.pct === null ? "—" : `${b.pct}%`,
            ])}
          />
        }
      >
        {bars.length === 0 ? (
          <p className="text-small text-muted-foreground">
            No goals yet.{" "}
            <Link to="/goals" className="text-primary underline-offset-4 hover:underline">
              Choose some
            </Link>
            .
          </p>
        ) : (
          <BarList
            monochrome
            data={bars.map((b) => ({
              key: b.goalId,
              label: `${b.icon ? `${b.icon} ` : ""}${b.title}`,
              pct: b.pct,
              valueText:
                b.pct !== null
                  ? `${b.pct}%`
                  : b.target
                    ? `${b.done} of ${b.target}`
                    : `${b.done} logged`,
            }))}
          />
        )}
      </ChartFrame>

      <ChartFrame
        title="Which days you show up"
        hint="Each weekday over how many times it has come round so far — not over seven, which would invent a pattern early on."
        table={
          <DataTable
            head={["Day", "Shown up", "Occurrences", "Rate"]}
            rows={dows.map((d) => [d.label, d.shownUp, d.occurrences, d.pct === null ? "—" : `${d.pct}%`])}
          />
        }
      >
        <ColumnChart
          colorIndex={1}
          data={dows.map((d) => ({
            key: d.label,
            label: d.label,
            pct: d.pct,
            valueText:
              d.pct === null ? "not yet" : `${d.shownUp}/${d.occurrences} · ${d.pct}%`,
          }))}
        />
        {bestDay && worstDay && bestDay.label !== worstDay.label ? (
          <p className="mt-3 text-small text-muted-foreground">
            Strongest on <span className="font-medium text-foreground">{bestDay.label}</span>, weakest on{" "}
            <span className="font-medium text-foreground">{worstDay.label}</span>.
          </p>
        ) : null}
      </ChartFrame>

      <ChartFrame
        title="Where the effort goes"
        hint="Logs by category, memories included. Counts, not percentages — these are not parts of one whole."
        legend={
          cats.length > 1 ? (
            <Legend
              items={cats.slice(0, 5).map((c, i) => ({
                label: c.label,
                color: SERIES[i % SERIES.length]!,
              }))}
            />
          ) : undefined
        }
        table={
          <DataTable
            head={["Category", "Logs"]}
            rows={cats.map((c) => [`${c.emoji} ${c.label}`, c.logs])}
          />
        }
      >
        {cats.length === 0 ? (
          <p className="text-small text-muted-foreground">Nothing logged yet.</p>
        ) : (
          <BarList
            data={cats.map((c, i) => ({
              key: c.category,
              label: `${c.emoji} ${categoryMeta(c.category).label}`,
              // Scaled against the busiest category, so the bars compare to
              // each other rather than to an imaginary 100.
              pct: Math.round((c.logs / catMax) * 100),
              valueText: `${c.logs}`,
              colorIndex: i % SERIES.length,
            }))}
          />
        )}
      </ChartFrame>

      <p className="text-tiny text-muted-foreground">
        A dash means there is no honest denominator yet, not zero. Percentages never average across goals
        that measure different things.
      </p>
    </div>
  );
}
