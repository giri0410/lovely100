import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Camera, Check, PartyPopper, Plus, Settings2, Sparkles } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ProgressRing } from "@/components/ProgressRing";
import { useAddLogMutation, useGoalLogMutation } from "@/hooks/useChallenge";
import {
  MILESTONES,
  encouragement,
  formatLongDate,
  formatMoney,
  todayISO,
  weekNumberForDay,
} from "@/lib/challenge";
import { goalActiveOn } from "@/lib/progress";
import { logMeetsTarget, targetLabel, type Goal, type Log } from "@/lib/goals";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/today")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Today — Lovely 100" },
      { name: "description", content: "Your goals for today, whatever you set them to be." },
      { property: "og:title", content: "Today — Lovely 100" },
      { property: "og:description", content: "Log today in about thirty seconds." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TodayPage,
});

/** A percentage when there's an honest denominator, otherwise a plain count. */
function pctOrCount(pct: number | null, count: number, noun: string): string {
  if (pct !== null) return `${pct}%`;
  return `${count} ${count === 1 ? noun : `${noun}s`}`;
}

function TodayPage() {
  return (
    <AppShell>
      {({ me, data, progress, t, partner, mine }) => {
        const today = todayISO();

        // Goals I can log today: mine or the journey's, already started, not
        // archived. Sorted as the user arranged them.
        const visible = data.goals
          .filter((g) => g.owner_member_id === null || g.owner_member_id === me.id)
          .filter((g) => goalActiveOn(g, today))
          .sort((a, b) => a.sort_order - b.sort_order);

        const dated = visible.filter((g) => g.cadence !== "open");
        const open = visible.filter((g) => g.cadence === "open");

        const myLogsToday = data.logs.filter((l) => l.member_id === me.id && l.date === today);
        const metToday = (g: Goal, memberId: string) =>
          data.logs.some(
            (l) => l.member_id === memberId && l.goal_id === g.id && l.date === today && logMeetsTarget(g, l),
          );

        const myCount = dated.filter((g) => metToday(g, me.id)).length;
        const total = dated.length;
        const together = progress.members.length > 1;
        const allDone =
          together && total > 0 && progress.members.every((m) => dated.every((g) => metToday(g, m.member.id)));

        // A milestone is only worth celebrating on a day that was finished.
        const milestone =
          MILESTONES.includes(progress.currentDay) && total > 0 && myCount === total
            ? progress.currentDay
            : null;

        // Savings stay in avoided_expenses — a separate concept from goals,
        // with its own screen — so they are summed here rather than folded
        // into the goal engine.
        const savedTotal = data.expenses.reduce((s, e) => s + Number(e.amount || 0), 0);

        const headlinePct = together ? progress.togetherDaysPct : mine?.showUpPct ?? null;
        const headlineDays = together ? progress.togetherDays : mine?.activeDays ?? 0;
        const streak = mine?.showUpStreak ?? { current: 0, best: 0 };

        return (
          <div className="space-y-5 px-5 pb-8 pt-7">
            <header className="animate-rise">
              <p className="eyebrow">Lovely 100</p>
              <h1 className="mt-1 text-2xl">
                Day {progress.currentDay} — {formatLongDate(today)}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">{t.todaySubtitle}</p>
            </header>

            {milestone ? (
              <div className="surface animate-pop flex items-center gap-3 border-primary/30 bg-primary/5 p-4">
                <PartyPopper className="size-6 text-primary" />
                <div>
                  <p className="font-display text-lg">🎉 {milestone} days!</p>
                  <p className="text-sm text-muted-foreground">
                    {together
                      ? `You've kept this going together for ${milestone} days.`
                      : `You've kept this going for ${milestone} days.`}
                  </p>
                </div>
              </div>
            ) : null}

            <section className="surface flex items-center gap-5 p-5">
              <ProgressRing
                value={(progress.currentDay / data.journey.duration) * 100}
                size={116}
                label={`${progress.currentDay}`}
                sublabel={`of ${data.journey.duration} days`}
              />
              <div className="flex-1 space-y-3">
                <div>
                  <p className="eyebrow">{t.showUpLabel}</p>
                  {/* A count rather than a fabricated 0% before any day has
                      elapsed — see progress.ts on denominators. */}
                  <p className="font-display text-3xl">{pctOrCount(headlinePct, headlineDays, "day")}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <MiniStat label="Current streak" value={`🔥 ${streak.current}`} />
                  <MiniStat label="Best streak" value={`${streak.best} days`} />
                  <MiniStat label="Money avoided" value={formatMoney(savedTotal)} />
                  <MiniStat label="Memories" value={`${progress.moments.length}`} />
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex items-baseline justify-between">
                <h2 className="text-lg">Today's goals</h2>
                <span className="text-sm text-muted-foreground">
                  {total > 0 ? `${myCount}/${total} done` : "none set"}
                </span>
              </div>

              {visible.length === 0 ? (
                <div className="surface p-5 text-sm">
                  <p className="font-medium">No goals yet</p>
                  <p className="mt-1 text-muted-foreground">
                    Pick what you want these 100 days to be about — health, cooking, places, learning, or
                    something of your own.
                  </p>
                  <Link
                    to="/goals"
                    className="mt-3 inline-block rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                  >
                    Choose your goals
                  </Link>
                </div>
              ) : null}

              {dated.map((goal) => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  log={myLogsToday.find((l) => l.goal_id === goal.id)}
                  date={today}
                  journeyId={data.journey.id}
                  memberId={me.id}
                />
              ))}

              {total > 0 ? (
                <div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-500"
                      style={{ width: `${(myCount / total) * 100}%` }}
                    />
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Today's progress — {Math.round((myCount / total) * 100)}%
                  </p>
                </div>
              ) : null}
            </section>

            {open.length > 0 ? (
              <section className="space-y-3">
                <h2 className="text-lg">Whenever you like</h2>
                {open.map((goal) => (
                  <OpenGoalCard
                    key={goal.id}
                    goal={goal}
                    logs={data.logs.filter((l) => l.goal_id === goal.id)}
                    mineCount={
                      mine?.goals.find((g) => g.goal.id === goal.id)?.unitsDone ?? 0
                    }
                    date={today}
                    journeyId={data.journey.id}
                    memberId={me.id}
                  />
                ))}
              </section>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Link
                to="/goals"
                className="flex items-center gap-2 rounded-xl border border-input px-4 py-2.5 text-sm"
              >
                <Settings2 className="size-4" />
                Manage goals
              </Link>
              {/* Mobile has no sidebar, so the review needs a way in from the
                  screen people actually open every day. */}
              <Link
                to="/memories"
                className="flex items-center gap-2 rounded-xl border border-input px-4 py-2.5 text-sm"
              >
                <Camera className="size-4" />
                Keep a memory
              </Link>
              <Link
                to="/review"
                className="flex items-center gap-2 rounded-xl border border-input px-4 py-2.5 text-sm md:hidden"
              >
                Week {weekNumberForDay(progress.currentDay)} review →
              </Link>
            </div>

            {dated.length > 0 ? (
              <section className="surface overflow-hidden">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <h2 className="text-base">{t.todayTableTitle}</h2>
                  <Sparkles className="size-4 text-primary" />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-muted-foreground">
                        <th className="px-4 py-2 text-left font-medium">Goal</th>
                        <th className="px-2 py-2 text-center font-medium">{me.name}</th>
                        {/* No column at all without somebody else — a column of
                            "·" is just a reminder of an absence. */}
                        {partner ? (
                          <th className="px-2 py-2 text-center font-medium">{partner.name}</th>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody>
                      {dated.map((g) => (
                        <tr key={g.id} className="border-t border-border/70">
                          <td className="px-4 py-2.5">
                            {g.icon ? `${g.icon} ` : ""}
                            {g.title}
                          </td>
                          <td className="px-2 py-2.5 text-center">{metToday(g, me.id) ? "✓" : "—"}</td>
                          {partner ? (
                            <td className="px-2 py-2.5 text-center">
                              {/* Only goals shared across the journey are the
                                  other person's business; a personal goal is
                                  not theirs to have missed. */}
                              {g.owner_member_id === null ? (metToday(g, partner.id) ? "✓" : "—") : ""}
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="border-t border-border bg-accent/40 px-4 py-3 text-sm text-accent-foreground">
                  {together
                    ? encouragement({ myCount, total, day: progress.currentDay, together, allDone })
                    : t.soloFooter}
                </p>
              </section>
            ) : null}
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

/**
 * One dated goal (daily or weekly).
 *
 * The old HabitCard branched on `habit.key === "walk"` and
 * `=== "certification"` to decide which detail inputs to render. There is no
 * such switch here: a quantified goal gets an amount field because
 * `metric === "number"`, and its unit comes from the goal itself.
 */
export function GoalCard({
  goal,
  log,
  date,
  journeyId,
  memberId,
}: {
  goal: Goal;
  log: Log | undefined;
  date: string;
  journeyId: string;
  memberId: string;
}) {
  const mutation = useGoalLogMutation(journeyId, memberId);
  const logged = Boolean(log);
  const met = log ? logMeetsTarget(goal, log) : false;

  const [amount, setAmount] = useState<string>(log?.amount === null || log?.amount === undefined ? "" : String(log.amount));
  const [note, setNote] = useState<string>(log?.note ?? "");

  // Resync when the log changes underneath us — the calendar dialog reuses
  // this component across days, and the other member's edit can land while
  // it's mounted. Without this the fields keep the first day's values.
  const savedAmount = log?.amount ?? null;
  const savedNote = log?.note ?? null;
  useEffect(() => setAmount(savedAmount === null ? "" : String(savedAmount)), [savedAmount, date]);
  useEffect(() => setNote(savedNote ?? ""), [savedNote, date]);

  const toggle = () =>
    mutation.mutate({
      goal,
      date,
      on: !logged,
      amount: amount ? Number(amount) : null,
      note: note || null,
    });

  const save = () =>
    mutation.mutate({
      goal,
      date,
      on: true,
      amount: amount ? Number(amount) : null,
      note: note || null,
    });

  const hint = targetLabel(goal);

  return (
    <div className={cn("surface p-4 transition-colors", met && "border-primary/40 bg-primary/5")}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          disabled={mutation.isPending}
          aria-label={`${logged ? "Undo" : "Complete"} ${goal.title}`}
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full border-2 transition-all",
            logged
              ? "animate-pop border-primary bg-primary text-primary-foreground"
              : "border-border text-transparent",
          )}
        >
          <Check className="size-5" />
        </button>
        <div className="flex-1">
          <p className="font-medium">
            {goal.icon ? `${goal.icon} ` : ""}
            {goal.title}
          </p>
          {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={mutation.isPending}
          className={cn(
            "rounded-full px-4 py-2 text-sm font-medium transition-colors",
            logged ? "bg-secondary text-secondary-foreground" : "bg-primary text-primary-foreground",
          )}
        >
          {logged ? "Done" : "Complete"}
        </button>
      </div>

      {/* A quantified goal gets its amount field from `metric`, not from a
          hardcoded list of which habits have numbers. Available whether or not
          the goal is ticked, so 20 of 30 minutes can be recorded honestly
          without claiming completion. */}
      {goal.metric === "number" ? (
        <DetailRow
          label={goal.unit ? goal.unit.charAt(0).toUpperCase() + goal.unit.slice(1) : "Amount"}
          value={amount}
          onChange={setAmount}
          onSave={save}
        />
      ) : null}

      {logged && goal.metric === "number" && goal.target_per_period !== null && !met ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Logged, but short of {goal.target_per_period}
          {goal.unit ? ` ${goal.unit}` : ""} — it counts as progress, not a finished day.
        </p>
      ) : null}
    </div>
  );
}

/**
 * An open goal — "visit 10 places". No checkbox, because it is not a thing you
 * do once a day; each tap adds another entry and they accumulate.
 */
function OpenGoalCard({
  goal,
  logs,
  mineCount,
  date,
  journeyId,
  memberId,
}: {
  goal: Goal;
  logs: Log[];
  mineCount: number;
  date: string;
  journeyId: string;
  memberId: string;
}) {
  const add = useAddLogMutation(journeyId, memberId);
  const [place, setPlace] = useState("");
  const target = goal.target_total;
  const recent = [...logs].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)).slice(0, 3);

  return (
    <div className="surface p-4">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <p className="font-medium">
            {goal.icon ? `${goal.icon} ` : ""}
            {goal.title}
          </p>
          <p className="text-sm text-muted-foreground">
            {target ? `${mineCount} of ${target}` : `${mineCount} so far`}
          </p>
        </div>
        <button
          type="button"
          disabled={add.isPending}
          onClick={() => {
            add.mutate({ goalId: goal.id, date, place: place || null });
            setPlace("");
          }}
          className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          <Plus className="size-4" />
          Add
        </button>
      </div>

      {target ? (
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${Math.min((mineCount / target) * 100, 100)}%` }}
          />
        </div>
      ) : null}

      <label className="mt-3 flex items-center gap-3 text-sm">
        <span className="w-32 shrink-0 text-muted-foreground">What / where</span>
        <input
          type="text"
          value={place}
          onChange={(e) => setPlace(e.target.value)}
          placeholder="Optional"
          className="w-full rounded-lg border border-input bg-background px-3 py-1.5 outline-none focus:border-primary"
        />
      </label>

      {recent.length > 0 ? (
        <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
          {recent.map((l) => (
            <li key={l.id}>
              {l.date}
              {l.place ? ` — ${l.place}` : ""}
            </li>
          ))}
        </ul>
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
