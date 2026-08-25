import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell, PageHeader } from "@/components/AppShell";
import * as api from "@/data";
import { weekNumberForDay } from "@/lib/challenge";
import { goalActiveOn } from "@/lib/progress";
import { logMeetsTarget } from "@/lib/goals";

export const Route = createFileRoute("/review")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Weekly Review — Lovely 100" },
      { name: "description", content: "Your Sunday summary: walks, healthy days, money avoided, study time and notes for next week." },
      { property: "og:title", content: "Weekly Review — Lovely 100" },
      { property: "og:description", content: "Look back every Sunday and plan the week ahead." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReviewPage,
});

function ReviewPage() {
  return (
    <AppShell>
      {({ me, data, progress, t }) => {
        const currentWeek = weekNumberForDay(progress.currentDay);
        return (
          <ReviewView
            me={me.id}
            journeyId={data.journey.id}
            progress={progress}
            t={t}
            data={data}
            initialWeek={currentWeek}
          />
        );
      }}
    </AppShell>
  );
}

function ReviewView({
  me,
  journeyId,
  progress,
  t,
  data,
  initialWeek,
}: {
  me: string;
  journeyId: string;
  progress: import("@/lib/progress").JourneyProgress;
  t: import("@/lib/copy").Copy;
  data: import("@/hooks/useChallenge").ChallengeData;
  initialWeek: number;
}) {
  const qc = useQueryClient();
  const [week, setWeek] = useState(initialWeek);
  const weeks = Array.from({ length: Math.ceil(data.journey.duration / 7) }, (_, i) => i + 1).filter(
    (w) => w <= initialWeek,
  );
  const weekDates = progress.dates.slice((week - 1) * 7, week * 7).filter((d) => d <= progress.today);

  // Per-goal counts for the selected week, out of the days that goal was
  // actually running — not out of seven, and not out of four goals.
  const myGoals = data.goals
    .filter((g) => g.owner_member_id === null || g.owner_member_id === me)
    .sort((a, b) => a.sort_order - b.sort_order);

  const rows = myGoals
    .map((g) => {
      const activeDates = weekDates.filter((d) => goalActiveOn(g, d));
      if (activeDates.length === 0) return null;
      const met = activeDates.filter((d) =>
        data.logs.some(
          (l) => l.member_id === me && l.goal_id === g.id && l.date === d && logMeetsTarget(g, l),
        ),
      ).length;
      // A weekly goal's denominator is its per-week target. Showing "1 / 7
      // days" for a 3x-a-week goal invents a target the user never set.
      const outOf = g.cadence === "weekly" ? g.target_per_period : activeDates.length;
      const amount = data.logs
        .filter((l) => l.member_id === me && l.goal_id === g.id && weekDates.includes(l.date))
        .reduce((sum, l) => sum + Number(l.amount ?? 0), 0);
      return { goal: g, met, outOf, amount };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const weekLogs = data.logs.filter((l) => l.member_id === me && weekDates.includes(l.date));
  const daysShownUp = new Set(weekLogs.map((l) => l.date)).size;
  const moments = weekLogs.filter((l) => l.goal_id === null);
  // Past its last day, not merely on it — day 21 is still being lived.
  const complete = progress.currentDay > week * 7;

  const existing = data.reviews.find((r) => r.member_id === me && r.week_number === week);
  const [well, setWell] = useState(existing?.what_went_well ?? "");
  const [improve, setImprove] = useState(existing?.what_to_improve ?? "");

  useEffect(() => {
    setWell(existing?.what_went_well ?? "");
    setImprove(existing?.what_to_improve ?? "");
  }, [week, existing?.what_went_well, existing?.what_to_improve]);

  const save = useMutation({
    mutationFn: () =>
      api.upsertReview({
        journeyId,
        memberId: me,
        weekNumber: week,
        whatWentWell: well || null,
        whatToImprove: improve || null,
      }),
    onSuccess: () => {
      toast.success("Review saved 💛");
      qc.invalidateQueries({ queryKey: ["challenge", journeyId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const partnerReviews = data.reviews.filter((r) => r.week_number === week && r.member_id !== me);

  return (
    <div className="space-y-5 px-5 pb-8">
      <PageHeader title={`Week ${week} review`} subtitle={t.reviewSubtitle} />

      <div className="flex flex-wrap gap-2 px-0">
        {weeks.map((w) => (
          <button
            key={w}
            onClick={() => setWeek(w)}
            className={`rounded-full px-3 py-1.5 text-sm ${
              w === week ? "bg-primary text-primary-foreground" : "border border-input"
            }`}
          >
            W{w}
          </button>
        ))}
      </div>

      <section className="surface space-y-3 p-5">
        <h2 className="text-lg">{complete ? `Week ${week} complete 🎉` : `Week ${week} so far`}</h2>
        <Row label="Days you showed up" value={`${daysShownUp} / ${weekDates.length}`} />
        {rows.map((r) => (
          <Row
            key={r.goal.id}
            label={`${r.goal.icon ? `${r.goal.icon} ` : ""}${r.goal.title}`}
            value={
              r.goal.cadence === "open"
                ? `${r.met} added`
                : `${r.met}${r.outOf === null ? "" : ` / ${r.outOf}`}${
                    r.goal.cadence === "weekly" ? " this week" : " days"
                  }${
                    r.goal.metric === "number" && r.amount > 0
                      ? ` · ${r.amount}${r.goal.unit ? ` ${r.goal.unit}` : ""}`
                      : ""
                  }`
            }
          />
        ))}
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No goals were running this week.</p>
        ) : null}
        {moments.length > 0 ? (
          <Row label="Memories kept" value={`${moments.length}`} />
        ) : null}
      </section>

      <section className="surface space-y-3 p-5">
        <h2 className="text-lg">Your notes</h2>
        <label className="block text-sm">
          <span className="text-muted-foreground">What went well?</span>
          <textarea
            value={well}
            onChange={(e) => setWell(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 outline-none focus:border-primary"
          />
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">{t.reviewImprovePrompt}</span>
          <textarea
            value={improve}
            onChange={(e) => setImprove(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 outline-none focus:border-primary"
          />
        </label>
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {save.isPending ? "Saving…" : "Save review"}
        </button>
      </section>

      {partnerReviews.length > 0 ? (
        <section className="surface space-y-2 p-5 text-sm">
          <h2 className="text-lg">From the others</h2>
          {partnerReviews.map((r) => (
            <div key={r.id} className="space-y-1">
              <p>
                <span className="text-muted-foreground">Went well: </span>
                {r.what_went_well || "—"}
              </p>
              <p>
                <span className="text-muted-foreground">To improve: </span>
                {r.what_to_improve || "—"}
              </p>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
