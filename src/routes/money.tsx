import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell, PageHeader } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney, formatShortDate, todayISO } from "@/lib/challenge";
import { monthlySavings } from "@/lib/stats";

export const Route = createFileRoute("/money")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Money We Didn't Spend — 100 Days Together" },
      { name: "description", content: "Log unnecessary purchases you avoided and see the potential money saved together." },
      { property: "og:title", content: "Money We Didn't Spend — 100 Days Together" },
      { property: "og:description", content: "Track avoided purchases and build financial discipline as a couple." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MoneyPage,
});

function MoneyPage() {
  return (
    <AppShell>
      {({ me, data, stats }) => <MoneyView me={me.id} coupleId={data.couple.id} expenses={data.expenses} profiles={data.profiles} total={stats.totalSaved} />}
    </AppShell>
  );
}

function MoneyView({
  me,
  coupleId,
  expenses,
  profiles,
  total,
}: {
  me: string;
  coupleId: string;
  expenses: { id: string; profile_id: string; date: string; amount: number; description: string | null; reason: string | null }[];
  profiles: { id: string; name: string }[];
  total: number;
}) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(todayISO());
  const months = monthlySavings(expenses as never);

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("avoided_expenses").insert({
        couple_id: coupleId,
        profile_id: me,
        amount: Number(amount),
        description: description || null,
        reason: reason || null,
        date,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Nice call — logged as money not spent.");
      setAmount("");
      setDescription("");
      setReason("");
      qc.invalidateQueries({ queryKey: ["challenge", coupleId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("avoided_expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["challenge", coupleId] }),
  });

  return (
    <div className="space-y-5 px-5 pb-8">
      <PageHeader title="Money We Didn't Spend" subtitle="Potential money saved by avoiding unnecessary purchases." />

      <section className="surface bg-success/10 p-5 text-center">
        <p className="eyebrow">Total avoided spending</p>
        <p className="font-display text-4xl">{formatMoney(total)}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          This is not money in the bank — it's what you chose not to spend.
        </p>
      </section>

      <section className="surface space-y-3 p-5">
        <h2 className="text-lg">Add an avoided expense</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Amount (₹)">
            <input
              type="number"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 outline-none focus:border-primary"
            />
          </Field>
          <Field label="Date">
            <input
              type="date"
              value={date}
              max={todayISO()}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 outline-none focus:border-primary"
            />
          </Field>
          <Field label="What you wanted">
            <input
              value={description}
              placeholder="Restaurant dinner"
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 outline-none focus:border-primary"
            />
          </Field>
          <Field label="Why you skipped it">
            <input
              value={reason}
              placeholder="Cooked at home"
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 outline-none focus:border-primary"
            />
          </Field>
        </div>
        <button
          onClick={() => add.mutate()}
          disabled={!amount || add.isPending}
          className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {add.isPending ? "Saving…" : "Log avoided expense"}
        </button>
      </section>

      <section className="surface p-5">
        <h2 className="text-lg">Monthly breakdown</h2>
        {months.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No entries yet.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {months.map((m) => (
              <li key={m.label} className="flex justify-between">
                <span className="text-muted-foreground">
                  {m.label} · {m.count} purchases avoided
                </span>
                <span className="font-medium">{formatMoney(m.total)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="surface p-5">
        <h2 className="text-lg">Recent entries</h2>
        {expenses.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Nothing here yet. Next time you skip a purchase, log it — it adds up fast.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {expenses.map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                <div>
                  <p className="font-medium">{e.description || "Avoided purchase"}</p>
                  <p className="text-muted-foreground">
                    {formatShortDate(e.date)} · {profiles.find((p) => p.id === e.profile_id)?.name ?? "Partner"}
                    {e.reason ? ` · ${e.reason}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="font-semibold">{formatMoney(Number(e.amount))}</span>
                  {e.profile_id === me ? (
                    <button
                      onClick={() => remove.mutate(e.id)}
                      className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
