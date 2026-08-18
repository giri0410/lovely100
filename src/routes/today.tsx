import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Check, PartyPopper, Sparkles } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ProgressRing } from "@/components/ProgressRing";
import { useHabitMutation } from "@/hooks/useChallenge";
import {
  HABITS,
  MILESTONES,
  completedCount,
  encouragement,
  formatLongDate,
  formatMinutes,
  formatMoney,
  isSunday,
  todayISO,
  type DailyHabit,
} from "@/lib/challenge";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/today")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Today — 100 Days Together" },
      { name: "description", content: "Your four daily habits for today: walk, healthy food, mindful spending and certification study." },
      { property: "og:title", content: "Today — 100 Days Together" },
      { property: "og:description", content: "Check off today's four habits and see how your partner is doing." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TodayPage,
});

function TodayPage() {
  return (
    <AppShell>
      {({ me, data, stats, partner }) => {
        const today = todayISO();
        const mine = stats.perProfile.find((p) => p.profile.id === me.id);
        const theirs = stats.perProfile.find((p) => p.profile.id === partner?.id);
        const myEntry = mine?.entriesByDate.get(today);
        const partnerEntry = theirs?.entriesByDate.get(today);
        const myCount = completedCount(myEntry);
        const partnerCount = completedCount(partnerEntry);
        const bothDone = myCount === 4 && (!partner || partnerCount === 4);
        const milestone = MILESTONES.includes(stats.currentDay) && myCount === 4 ? stats.currentDay : null;

        return (
          <div className="space-y-5 px-5 pb-8 pt-7">
            <header className="animate-rise">
              <p className="eyebrow">100 Days Together</p>
              <h1 className="mt-1 text-2xl">
                Day {stats.currentDay} — {formatLongDate(today)}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Small habits. Better health. Stronger discipline. Together.
              </p>
            </header>

            {milestone ? (
              <div className="surface animate-pop flex items-center gap-3 border-primary/30 bg-primary/5 p-4">
                <PartyPopper className="size-6 text-primary" />
                <div>
                  <p className="font-display text-lg">🎉 {milestone} Days Together!</p>
                  <p className="text-sm text-muted-foreground">
                    You've completed {milestone} days of building better habits together.
                  </p>
                </div>
              </div>
            ) : null}

            <section className="surface flex items-center gap-5 p-5">
              <ProgressRing
                value={(stats.currentDay / data.couple.duration) * 100}
                size={116}
                label={`${stats.currentDay}`}
                sublabel={`of ${data.couple.duration} days`}
              />
              <div className="flex-1 space-y-3">
                <div>
                  <p className="eyebrow">Team score</p>
                  <p className="font-display text-3xl">{stats.teamScore}%</p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <MiniStat label="Current streak" value={`🔥 ${stats.coupleStreak.current}`} />
                  <MiniStat label="Best streak" value={`${stats.coupleStreak.best} days`} />
                  <MiniStat label="Money avoided" value={formatMoney(stats.totalSaved)} />
                  <MiniStat label="Study time" value={formatMinutes(stats.totalStudyMinutes)} />
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex items-baseline justify-between">
                <h2 className="text-lg">Today's goals</h2>
                <span className="text-sm text-muted-foreground">{myCount}/4 done</span>
              </div>
              {HABITS.map((habit) => (
                <HabitCard
                  key={habit.key}
                  habit={habit}
                  entry={myEntry}
                  date={today}
                  coupleId={data.couple.id}
                  profileId={me.id}
                />
              ))}
              <div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    style={{ width: `${(myCount / 4) * 100}%` }}
                  />
                </div>
                <p className="mt-2 text-sm text-muted-foreground">Today's progress — {Math.round((myCount / 4) * 100)}%</p>
              </div>
            </section>

            {isSunday(today) ? (
              <div className="surface bg-warm/15 p-4 text-sm">
                <p className="font-medium">Sunday — planned cheat day 🍲</p>
                <p className="mt-1 text-muted-foreground">
                  Enjoy your cheat meal at home if you can. Skipping outside food still counts as a win.
                </p>
                <Link to="/review" className="mt-3 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline">
                  Open this week's review →
                </Link>
              </div>
            ) : null}

            <section className="surface overflow-hidden">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <h2 className="text-base">Together today</h2>
                <Sparkles className="size-4 text-primary" />
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="px-4 py-2 text-left font-medium">Habit</th>
                    <th className="px-2 py-2 text-center font-medium">{me.name}</th>
                    <th className="px-2 py-2 text-center font-medium">{partner?.name ?? "Partner"}</th>
                  </tr>
                </thead>
                <tbody>
                  {HABITS.map((h) => (
                    <tr key={h.key} className="border-t border-border/70">
                      <td className="px-4 py-2.5">{h.label}</td>
                      <td className="px-2 py-2.5 text-center">{myEntry?.[h.column] ? "✓" : "—"}</td>
                      <td className="px-2 py-2.5 text-center">
                        {partner ? (partnerEntry?.[h.column] ? "✓" : "—") : "·"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="border-t border-border bg-accent/40 px-4 py-3 text-sm text-accent-foreground">
                {partner
                  ? encouragement(bothDone, myCount, stats.currentDay)
                  : "Invite your partner from Settings to track this together."}
              </p>
            </section>
          </div>
        );
      }}
    </AppShell>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-secondary/70 px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}

export function HabitCard({
  habit,
  entry,
  date,
  coupleId,
  profileId,
}: {
  habit: (typeof HABITS)[number];
  entry: DailyHabit | undefined;
  date: string;
  coupleId: string;
  profileId: string;
}) {
  const mutation = useHabitMutation(coupleId, profileId);
  const done = Boolean(entry?.[habit.column]);
  const [walk, setWalk] = useState<string>(String(entry?.walk_duration ?? ""));
  const [minutes, setMinutes] = useState<string>(String(entry?.certification_minutes ?? ""));
  const [topic, setTopic] = useState<string>(entry?.certification_topic ?? "");

  const toggle = () => mutation.mutate({ date, patch: { [habit.column]: !done } as Partial<DailyHabit> });

  return (
    <div className={cn("surface p-4 transition-colors", done && "border-primary/40 bg-primary/5")}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          disabled={mutation.isPending}
          aria-label={`${done ? "Undo" : "Complete"} ${habit.label}`}
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full border-2 transition-all",
            done ? "animate-pop border-primary bg-primary text-primary-foreground" : "border-border text-transparent",
          )}
        >
          <Check className="size-5" />
        </button>
        <div className="flex-1">
          <p className="font-medium">
            {habit.emoji} {habit.label}
          </p>
          <p className="text-sm text-muted-foreground">{habit.hint}</p>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={mutation.isPending}
          className={cn(
            "rounded-full px-4 py-2 text-sm font-medium transition-colors",
            done ? "bg-secondary text-secondary-foreground" : "bg-primary text-primary-foreground",
          )}
        >
          {done ? "Done" : "Complete"}
        </button>
      </div>

      {done && habit.key === "walk" ? (
        <DetailRow
          label="Minutes walked"
          value={walk}
          onChange={setWalk}
          onSave={() => mutation.mutate({ date, patch: { walk_duration: walk ? Number(walk) : null } })}
        />
      ) : null}

      {done && habit.key === "certification" ? (
        <div className="mt-3 space-y-2">
          <DetailRow
            label="Minutes studied"
            value={minutes}
            onChange={setMinutes}
            onSave={() => mutation.mutate({ date, patch: { certification_minutes: minutes ? Number(minutes) : null } })}
          />
          <DetailRow
            label="Topic"
            type="text"
            value={topic}
            onChange={setTopic}
            onSave={() => mutation.mutate({ date, patch: { certification_topic: topic || null } })}
          />
        </div>
      ) : null}
    </div>
  );
}

function DetailRow({
  label,
  value,
  onChange,
  onSave,
  type = "number",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  type?: string;
}) {
  return (
    <label className="mt-3 flex items-center gap-3 text-sm">
      <span className="w-32 shrink-0 text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onSave}
        className="w-full rounded-lg border border-input bg-background px-3 py-1.5 outline-none focus:border-primary"
      />
    </label>
  );
}
