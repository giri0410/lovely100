import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell, PageHeader } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import {
  completedCount,
  formatMinutes,
  formatMoney,
  isSunday,
  weekNumberForDay,
} from "@/lib/challenge";

export const Route = createFileRoute("/review")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Weekly Review — 100 Days Together" },
      { name: "description", content: "Your Sunday summary: walks, healthy days, money avoided, study time and notes for next week." },
      { property: "og:title", content: "Weekly Review — 100 Days Together" },
      { property: "og:description", content: "Reflect together every Sunday and plan the week ahead." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReviewPage,
});

function ReviewPage() {
  return (
    <AppShell>
      {({ me, data, stats }) => {
        const currentWeek = weekNumberForDay(stats.currentDay);
        return <ReviewView me={me.id} coupleId={data.couple.id} stats={stats} data={data} initialWeek={currentWeek} />;
      }}
    </AppShell>
  );
}

function ReviewView({
  me,
  coupleId,
  stats,
  data,
  initialWeek,
}: {
  me: string;
  coupleId: string;
  stats: ReturnType<typeof import("@/lib/stats").buildStats>;
  data: import("@/hooks/useChallenge").ChallengeData;
  initialWeek: number;
}) {
  const qc = useQueryClient();
  const [week, setWeek] = useState(initialWeek);
  const weeks = Array.from({ length: Math.ceil(data.couple.duration / 7) }, (_, i) => i + 1).filter(
    (w) => w <= initialWeek,
  );
  const weekDates = stats.dates.slice((week - 1) * 7, week * 7).filter((d) => d <= stats.today);

  const mine = stats.perProfile.find((p) => p.profile.id === me);
  const walkDays = weekDates.filter((d) => mine?.entriesByDate.get(d)?.walk_completed).length;
  const healthy = weekDates.filter((d) => mine?.entriesByDate.get(d)?.healthy_food_completed && !isSunday(d)).length;
  const cheat = weekDates.filter((d) => mine?.entriesByDate.get(d)?.healthy_food_completed && isSunday(d)).length;
  const study = weekDates.reduce(
    (s, d) =>
      s + (mine?.entriesByDate.get(d)?.certification_completed ? (mine.entriesByDate.get(d)?.certification_minutes ?? 30) : 0),
    0,
  );
  const avoided = data.expenses
    .filter((e) => weekDates.includes(e.date))
    .reduce((s, e) => s + Number(e.amount), 0);
  const overall = weekDates.length
    ? Math.round((weekDates.reduce((s, d) => s + completedCount(mine?.entriesByDate.get(d)), 0) / (weekDates.length * 4)) * 100)
    : 0;

  const existing = data.reviews.find((r) => r.profile_id === me && r.week_number === week);
  const [well, setWell] = useState(existing?.what_went_well ?? "");
  const [improve, setImprove] = useState(existing?.what_to_improve ?? "");

  useEffect(() => {
    setWell(existing?.what_went_well ?? "");
    setImprove(existing?.what_to_improve ?? "");
  }, [week, existing?.what_went_well, existing?.what_to_improve]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("weekly_reviews").upsert(
        {
          couple_id: coupleId,
          profile_id: me,
          week_number: week,
          what_went_well: well || null,
          what_to_improve: improve || null,
        } as never,
        { onConflict: "profile_id,week_number" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Review saved 💛");
      qc.invalidateQueries({ queryKey: ["challenge", coupleId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const partnerReviews = data.reviews.filter((r) => r.week_number === week && r.profile_id !== me);

  return (
    <div className="space-y-5 px-5 pb-8">
      <PageHeader title={`Week ${week} review`} subtitle="A gentle look back, and a plan for the week ahead." />

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
        <h2 className="text-lg">Week {week} complete 🎉</h2>
        <Row label="Morning walk" value={`${walkDays} / ${weekDates.length} days`} />
        <Row label="Healthy food" value={`${healthy} healthy days + ${cheat} cheat day${cheat === 1 ? "" : "s"}`} />
        <Row label="Unnecessary spending" value={`${formatMoney(avoided)} avoided`} />
        <Row label="Certification" value={formatMinutes(study)} />
        <Row label="Overall" value={`${overall}%`} />
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
          <span className="text-muted-foreground">What should we improve next week?</span>
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
          <h2 className="text-lg">From your partner</h2>
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
