import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { HabitCard } from "@/routes/today";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  HABITS,
  completedCount,
  dayStatus,
  formatLongDate,
  type DayStatus,
} from "@/lib/challenge";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/calendar")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "100-Day Calendar — 100 Days Together" },
      { name: "description", content: "See all 100 days at a glance and edit past days of your couple habit challenge." },
      { property: "og:title", content: "100-Day Calendar — 100 Days Together" },
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
  today: "border-primary text-primary ring-2 ring-primary/25",
  future: "border-dashed border-border text-muted-foreground/60",
};

function CalendarPage() {
  const [openDate, setOpenDate] = useState<string | null>(null);

  return (
    <AppShell>
      {({ me, data, stats, partner }) => {
        const mine = stats.perProfile.find((p) => p.profile.id === me.id);
        const theirs = stats.perProfile.find((p) => p.profile.id === partner?.id);
        const openDay = openDate ? stats.dates.indexOf(openDate) + 1 : 0;
        const myEntry = openDate ? mine?.entriesByDate.get(openDate) : undefined;
        const partnerEntry = openDate ? theirs?.entriesByDate.get(openDate) : undefined;
        const editable = openDate ? openDate <= stats.today : false;

        return (
          <div className="pb-8">
            <PageHeader
              title="100-Day Calendar"
              subtitle={`${stats.completedDaysTogether} days fully completed together so far.`}
            />
            <div className="px-5">
              <div className="surface p-4">
                <div className="grid grid-cols-10 gap-1.5">
                  {stats.dates.map((iso, i) => {
                    const count = completedCount(mine?.entriesByDate.get(iso));
                    const status = dayStatus(count, iso, stats.today);
                    return (
                      <button
                        key={iso}
                        onClick={() => setOpenDate(iso)}
                        className={cn(
                          "aspect-square rounded-lg border text-[10px] font-semibold transition-transform hover:scale-105",
                          STATUS_STYLES[status],
                        )}
                        aria-label={`Day ${i + 1}`}
                      >
                        {i + 1}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <Legend className="bg-primary" label="Completed" />
                  <Legend className="bg-warm/60" label="Partial" />
                  <Legend className="bg-secondary" label="Missed" />
                  <Legend className="border-2 border-primary" label="Today" />
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
                      {HABITS.map((h) => (
                        <HabitCard
                          key={h.key}
                          habit={h}
                          entry={myEntry}
                          date={openDate}
                          coupleId={data.couple.id}
                          profileId={me.id}
                        />
                      ))}
                      {partner ? (
                        <div className="surface p-4 text-sm">
                          <p className="eyebrow">{partner.name}'s day</p>
                          <ul className="mt-2 space-y-1">
                            {HABITS.map((h) => (
                              <li key={h.key} className="flex justify-between">
                                <span>{h.label}</span>
                                <span>{partnerEntry?.[h.column] ? "✓" : "✕"}</span>
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

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("size-3 rounded", className)} />
      {label}
    </span>
  );
}
