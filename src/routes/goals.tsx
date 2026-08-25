import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Archive, Plus } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useGoalMutations, useGoalTemplates } from "@/hooks/useChallenge";
import { CATEGORIES, categoryMeta, targetLabel, type Cadence, type Goal, type Metric } from "@/lib/goals";
import { todayISO } from "@/lib/challenge";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/goals")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Your goals — Lovely 100" },
      { name: "description", content: "Choose what your 100 days are about, and change it whenever you like." },
      { property: "og:title", content: "Your goals — Lovely 100" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GoalsPage,
});

function GoalsPage() {
  return (
    <AppShell>
      {({ me, data, t }) => (
        <GoalsView
          journeyId={data.journey.id}
          memberId={me.id}
          goals={data.goals}
          together={t.together}
        />
      )}
    </AppShell>
  );
}

function GoalsView({
  journeyId,
  memberId,
  goals,
  together,
}: {
  journeyId: string;
  memberId: string;
  goals: Goal[];
  together: boolean;
}) {
  const templates = useGoalTemplates();
  const { create, archive, applyTemplate } = useGoalMutations(journeyId);
  const [adding, setAdding] = useState(false);

  const active = goals.filter((g) => !g.archived_at).sort((a, b) => a.sort_order - b.sort_order);
  const archived = goals.filter((g) => g.archived_at);

  return (
    <div className="space-y-5 px-5 pb-8">
      <PageHeader
        title="Your goals"
        subtitle="Choose what these 100 days are about. You can change this whenever you like — nothing you've already logged is lost."
      />

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg">Active</h2>
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            <Plus className="size-4" />
            New goal
          </button>
        </div>

        {adding ? (
          <NewGoalForm
            together={together}
            pending={create.isPending}
            onCancel={() => setAdding(false)}
            onCreate={(input) =>
              create.mutate(
                {
                  journeyId,
                  // A personal goal is only mine to edit; a shared one belongs
                  // to the journey and either of us can manage it.
                  ownerMemberId: input.personal ? memberId : null,
                  title: input.title,
                  category: input.category,
                  icon: input.icon || null,
                  cadence: input.cadence,
                  metric: input.metric,
                  unit: input.unit || null,
                  targetPerPeriod: input.targetPerPeriod,
                  targetTotal: input.targetTotal,
                  // Today, never the journey's start — a goal added on day 40
                  // must not report 39 retroactive misses.
                  startsOn: todayISO(),
                  sortOrder: active.length + 1,
                },
                {
                  onSuccess: () => {
                    toast.success("Goal added 💛");
                    setAdding(false);
                  },
                  onError: (e: Error) => toast.error(e.message),
                },
              )
            }
          />
        ) : null}

        {active.length === 0 && !adding ? (
          <p className="surface p-5 text-sm text-muted-foreground">
            Nothing set yet. Add a goal of your own, or start from one of the sets below.
          </p>
        ) : null}

        {active.map((g) => (
          <div key={g.id} className="surface flex items-center gap-3 p-4">
            <div className="flex-1">
              <p className="font-medium">
                {g.icon ? `${g.icon} ` : ""}
                {g.title}
              </p>
              <p className="text-sm text-muted-foreground">
                {categoryMeta(g.category).label}
                {" · "}
                {g.cadence === "open" ? "whenever" : g.cadence}
                {targetLabel(g) ? ` · ${targetLabel(g)}` : ""}
                {g.owner_member_id ? " · just yours" : together ? " · shared" : ""}
              </p>
              {g.starts_on > todayISO() ? (
                <p className="mt-1 text-xs text-muted-foreground">Starts {g.starts_on}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() =>
                archive.mutate(g.id, {
                  onSuccess: () => toast.success("Goal archived"),
                  onError: (e: Error) => toast.error(e.message),
                })
              }
              disabled={archive.isPending}
              aria-label={`Archive ${g.title}`}
              className="rounded-full border border-input p-2 text-muted-foreground"
            >
              <Archive className="size-4" />
            </button>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg">Start from a set</h2>
        <p className="text-sm text-muted-foreground">
          These add a few goals at once. They start counting today, so adding one mid-journey never
          backdates a miss.
        </p>
        {templates.isLoading ? (
          <div className="h-24 animate-pulse rounded-2xl bg-secondary" />
        ) : null}
        {(templates.data ?? []).map((tpl) => (
          <div key={tpl.id} className="surface p-4">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <p className="font-medium">
                  {tpl.icon ? `${tpl.icon} ` : ""}
                  {tpl.title}
                </p>
                {tpl.description ? (
                  <p className="mt-1 text-sm text-muted-foreground">{tpl.description}</p>
                ) : null}
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {tpl.goals.map((g) => (
                    <li
                      key={g.title}
                      className="rounded-full bg-secondary/70 px-2.5 py-1 text-xs text-muted-foreground"
                    >
                      {g.icon ? `${g.icon} ` : ""}
                      {g.title}
                    </li>
                  ))}
                </ul>
              </div>
              <button
                type="button"
                disabled={applyTemplate.isPending}
                onClick={() =>
                  applyTemplate.mutate(
                    { journeyId, ownerMemberId: null, template: tpl, startsOn: todayISO() },
                    {
                      onSuccess: (r) => {
                        // Saying "added" when everything was skipped is the
                        // kind of small lie that makes people distrust the app.
                        if (r.added === 0) toast.info("You already have all of those");
                        else if (r.skipped > 0)
                          toast.success(`Added ${r.added} — you already had ${r.skipped}`);
                        else toast.success(`${tpl.title} added 💛`);
                      },
                      onError: (e: Error) => toast.error(e.message),
                    },
                  )
                }
                className="rounded-full border border-input px-3 py-1.5 text-sm font-medium disabled:opacity-60"
              >
                Add
              </button>
            </div>
          </div>
        ))}
      </section>

      {archived.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-lg">Archived</h2>
          <p className="text-sm text-muted-foreground">
            Kept, not deleted — days you already logged against these are still part of your story.
          </p>
          {archived.map((g) => (
            <div key={g.id} className="surface p-3 text-sm text-muted-foreground">
              {g.icon ? `${g.icon} ` : ""}
              {g.title}
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}

interface NewGoalInput {
  title: string;
  category: string;
  icon: string;
  cadence: Cadence;
  metric: Metric;
  unit: string;
  targetPerPeriod: number | null;
  targetTotal: number | null;
  personal: boolean;
}

const CADENCE_HELP: Record<Cadence, string> = {
  daily: "Something you aim to do every day.",
  weekly: "A few times a week, on whichever days suit you.",
  open: "No schedule — a list you work through whenever.",
};

function NewGoalForm({
  together,
  pending,
  onCreate,
  onCancel,
}: {
  together: boolean;
  pending: boolean;
  onCreate: (input: NewGoalInput) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("health");
  const [icon, setIcon] = useState("");
  const [cadence, setCadence] = useState<Cadence>("daily");
  const [quantified, setQuantified] = useState(false);
  const [unit, setUnit] = useState("");
  const [target, setTarget] = useState("");
  const [personal, setPersonal] = useState(false);

  const metric: Metric = quantified ? "number" : "bool";
  const targetNum = target ? Number(target) : null;

  const submit = () => {
    if (!title.trim()) {
      toast.error("Give the goal a name");
      return;
    }
    onCreate({
      title: title.trim(),
      category,
      icon: icon.trim(),
      cadence,
      metric,
      unit: quantified ? unit.trim() : "",
      // Targets have to match the cadence or the database rejects them, so the
      // form only ever sends the one that applies.
      targetPerPeriod: cadence === "open" ? null : targetNum,
      targetTotal: cadence === "open" ? targetNum : null,
      personal,
    });
  };

  return (
    <div className="surface space-y-3 p-4">
      <label className="block text-sm">
        <span className="text-muted-foreground">What is it?</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Morning walk, cook at home, call Amma…"
          className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 outline-none focus:border-primary"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-muted-foreground">Category</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 outline-none focus:border-primary"
          >
            {Object.entries(CATEGORIES).map(([key, meta]) => (
              <option key={key} value={key}>
                {meta.emoji} {meta.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">Emoji (optional)</span>
          <input
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            placeholder="🚶"
            className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 outline-none focus:border-primary"
          />
        </label>
      </div>

      <div className="space-y-1.5">
        <span className="text-sm text-muted-foreground">How often?</span>
        <div className="flex flex-wrap gap-2">
          {(["daily", "weekly", "open"] as Cadence[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCadence(c)}
              className={cn(
                "rounded-full px-3.5 py-2 text-sm capitalize",
                cadence === c ? "bg-primary text-primary-foreground" : "border border-input",
              )}
            >
              {c === "open" ? "Whenever" : c}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{CADENCE_HELP[cadence]}</p>
      </div>

      {cadence === "open" ? (
        <label className="block text-sm">
          <span className="text-muted-foreground">How many altogether? (optional)</span>
          <input
            type="number"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="10"
            className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 outline-none focus:border-primary"
          />
        </label>
      ) : (
        <>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={quantified}
              onChange={(e) => setQuantified(e.target.checked)}
              className="size-4"
            />
            <span>Track a number (minutes, pages, steps…)</span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            {quantified ? (
              <label className="block text-sm">
                <span className="text-muted-foreground">Unit</span>
                <input
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="minutes"
                  className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 outline-none focus:border-primary"
                />
              </label>
            ) : null}
            <label className="block text-sm">
              <span className="text-muted-foreground">
                {cadence === "weekly" ? "Times per week" : quantified ? "Target per day" : "Times per day"}
              </span>
              <input
                type="number"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder={cadence === "weekly" ? "3" : "30"}
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 outline-none focus:border-primary"
              />
            </label>
          </div>
        </>
      )}

      {together ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={personal}
            onChange={(e) => setPersonal(e.target.checked)}
            className="size-4"
          />
          <span>Just for me — they'll see it but can't change it</span>
        </label>
      ) : null}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {pending ? "Adding…" : "Add goal"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-xl border border-input px-4 py-2 text-sm">
          Cancel
        </button>
      </div>
    </div>
  );
}
