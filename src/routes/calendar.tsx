import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { GoalCard } from "@/routes/today";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { dayStatus, formatLongDate, type DayStatus } from "@/lib/challenge";
import { goalActiveOn } from "@/lib/progress";
import { logMeetsTarget, type Goal } from "@/lib/goals";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/calendar")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "100-Day Calendar — Lovely 100" },
      { name: "description", content: "See all 100 days at a glance and edit any past day of your journey." },
      { property: "og:title", content: "100-Day Calendar — Lovely 100" },
      { property: "og:description", content: "Every day of your challenge in one simple grid." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CalendarPage,
});

const STATUS_STYLES: Record<DayStatus, string> = {
  completed: "bg-primary text-primary-foreground border-primary",
  partial: "bg-warm/40 border-warm text-foreground",
  missed: "bg-secondary text-muted-foreground border-border",
  today: "border-primary text-primary",
  future: "border-dashed border-border text-muted-foreground/60",
};

const STATUS_LABELS: Record<DayStatus, string> = {
  completed: "all done",
  partial: "partly done",
  missed: "missed",
  today: "today, nothing logged yet",
  future: "upcoming",
};

function CalendarPage() {
  const [openDate, setOpenDate] = useState<string | null>(null);

  return (
    <AppShell>
      {({ me, data, progress, t, partner }) => {
        const openDay = openDate ? progress.dates.indexOf(openDate) + 1 : 0;
        const editable = openDate ? openDate <= progress.today : false;

        /** Dated goals this member could log on a given day. */
        const goalsOn = (iso: string) =>
          data.goals
            .filter((g) => g.owner_member_id === null || g.owner_member_id === me.id)
            .filter((g) => g.cadence !== "open" && goalActiveOn(g, iso))
            .sort((a, b) => a.sort_order - b.sort_order);

        const metOn = (iso: string, memberId: string, goal: Goal) =>
          data.logs.some(
            (l) => l.member_id === memberId && l.goal_id === goal.id && l.date === iso && logMeetsTarget(goal, l),
          );

        /** Counts for one member on one day: met, and how many were active. */
        const dayCounts = (iso: string, memberId: string) => {
          const goals = data.goals
            .filter((g) => g.owner_member_id === null || g.owner_member_id === memberId)
            .filter((g) => g.cadence !== "open" && goalActiveOn(g, iso));
          return {
            met: goals.filter((g) => metOn(iso, memberId, g)).length,
            total: goals.length,
          };
        };

        // Days where every goal that was running got done — the same test the
        // grid applies per cell.
        const fullyCompletedDays = progress.dates.filter((d) => {
          if (d > progress.today) return false;
          const { met, total } = dayCounts(d, me.id);
          return total > 0 && met >= total;
        }).length;


        return (
          <div className="pb-8">
            <PageHeader
              title="100-Day Calendar"
              // Counted from the same per-date rollup the grid below colours
              // itself from, so the sentence and the squares can never
              // disagree. togetherDays was wrong here: it counts days someone
              // logged anything, which is not "fully completed".
              subtitle={`${fullyCompletedDays} ${t.completedDaysSuffix}`}
            />
            <div className="px-5">
              <div className="surface p-4">
                <div className="grid grid-cols-10 gap-1.5">
                  {progress.dates.map((iso, i) => {
                    // Out of the goals active on that day, not out of four.
                    const { met, total } = dayCounts(iso, me.id);
                    const status = dayStatus(met, total, iso, progress.today);
                    const isToday = iso === progress.today;
                    const partnerCounts = partner ? dayCounts(iso, partner.id) : null;
                    const partnerDone = Boolean(
                      partnerCounts && partnerCounts.total > 0 && partnerCounts.met >= partnerCounts.total,
                    );
                    const label = [
                      `Day ${i + 1}`,
                      STATUS_LABELS[status],
                      partner ? (partnerDone ? `${partner.name} completed` : `${partner.name} did not`) : null,
                    ]
                      .filter(Boolean)
                      .join(", ");

                    return (
                      <button
                        key={iso}
                        onClick={() => setOpenDate(iso)}
                        className={cn(
                          "relative aspect-square rounded-lg border text-[10px] font-semibold transition-transform hover:scale-105",
                          STATUS_STYLES[status],
                          // Today reads as a ring so it can also show its own progress.
                          isToday && "ring-2 ring-primary/40",
                        )}
                        aria-label={label}
                      >
                        {i + 1}
                        {partnerDone ? (
                          <span
                            aria-hidden="true"
                            className={cn(
                              "absolute bottom-0.5 right-0.5 size-1.5 rounded-full",
                              status === "completed" ? "bg-primary-foreground/80" : "bg-success",
                            )}
                          />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <Legend className="bg-primary" label="You completed" />
                  <Legend className="bg-warm/60" label="Partial" />
                  <Legend className="bg-secondary" label="Missed" />
                  <Legend className="border-2 border-primary" label="Today" />
                  {partner ? <Legend className="bg-success" label={`${partner.name} completed`} dot /> : null}
                  <Legend className="border border-dashed border-border" label="Upcoming" />
                </div>
              </div>
            </div>

            <Dialog open={!!openDate} onOpenChange={(o) => !o && setOpenDate(null)}>
              <DialogContent className="max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    Day {openDay} · {openDate ? formatLongDate(openDate) : ""}
                  </DialogTitle>
                </DialogHeader>
                {openDate ? (
                  editable ? (
                    <div className="space-y-3">
                      {goalsOn(openDate).length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No goals were running on this day.
                        </p>
                      ) : null}
                      {goalsOn(openDate).map((g) => (
                        <GoalCard
                          key={g.id}
                          goal={g}
                          log={data.logs.find(
                            (l) => l.member_id === me.id && l.goal_id === g.id && l.date === openDate,
                          )}
                          date={openDate}
                          journeyId={data.journey.id}
                          memberId={me.id}
                        />
                      ))}
                      {partner ? (
                        <div className="surface p-4 text-sm">
                          <p className="eyebrow">{partner.name}'s day</p>
                          <ul className="mt-2 space-y-1">
                            {/* Only shared goals — a personal goal of theirs is
                                not mine to inspect, and vice versa. */}
                            {data.goals
                              .filter((g) => g.owner_member_id === null && g.cadence !== "open" && goalActiveOn(g, openDate))
                              .map((g) => (
                                <li key={g.id} className="flex justify-between">
                                  <span>{g.title}</span>
                                  <span>{metOn(openDate, partner.id, g) ? "✓" : "✕"}</span>
                                </li>
                              ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      This day hasn't arrived yet. Future days can't be completed early — come back on the day.
                    </p>
                  )
                ) : null}
              </DialogContent>
            </Dialog>
          </div>
        );
      }}
    </AppShell>
  );
}

function Legend({ className, label, dot }: { className: string; label: string; dot?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn(dot ? "size-1.5 rounded-full" : "size-3 rounded", className)} />
      {label}
    </span>
  );
}
