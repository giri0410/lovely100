import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMyProfile, useSession } from "@/hooks/useChallenge";
import { todayISO } from "@/lib/challenge";

export const Route = createFileRoute("/onboarding")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Set up your challenge — 100 Days Together" },
      { name: "description", content: "Create your 100-day couple challenge, join your partner, or explore the demo journey." },
      { property: "og:title", content: "Set up your challenge — 100 Days Together" },
      { property: "og:description", content: "Start your shared 100-day habit challenge." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Onboarding,
});

function Onboarding() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { userId, loading } = useSession();
  const meQuery = useMyProfile(userId);
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("me");
  const [coupleName, setCoupleName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !userId) navigate({ to: "/auth" });
  }, [loading, userId, navigate]);

  useEffect(() => {
    if (meQuery.data) navigate({ to: "/today" });
  }, [meQuery.data, navigate]);

  const demoProfiles = useQuery({
    queryKey: ["demo-profiles"],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, relationship, couple_id")
        .is("auth_user_id", null);
      if (error) throw error;
      return data ?? [];
    },
  });

  const finish = async () => {
    await qc.invalidateQueries({ queryKey: ["my-profile"] });
    navigate({ to: "/today" });
  };

  const claim = async (profileId: string) => {
    setBusy(true);
    const { error } = await supabase.from("profiles").update({ auth_user_id: userId }).eq("id", profileId);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("You're in. Welcome!");
    finish();
  };

  const createCouple = async () => {
    if (!name.trim()) { toast.error("Add your name first"); return; }
    setBusy(true);
    const { data: couple, error } = await supabase
      .from("couples")
      .insert({ name: coupleName.trim() || `${name.trim()}'s challenge`, start_date: todayISO(), duration: 100 })
      .select()
      .single();
    if (error || !couple) {
      setBusy(false);
      toast.error(error?.message ?? "Could not create the challenge");
      return;
    }
    const { error: pErr } = await supabase
      .from("profiles")
      .insert({ couple_id: couple.id, auth_user_id: userId, name: name.trim(), relationship });
    setBusy(false);
    if (pErr) { toast.error(pErr.message); return; }
    toast.success("Challenge created — Day 1 starts today!");
    finish();
  };

  const joinCouple = async () => {
    if (!name.trim() || !code.trim()) { toast.error("Add your name and the invite code"); return; }
    setBusy(true);
    const { data: couple, error } = await supabase
      .from("couples")
      .select("id")
      .eq("invite_code", code.trim().toUpperCase())
      .maybeSingle();
    if (error || !couple) {
      setBusy(false);
      toast.error("We couldn't find that invite code");
      return;
    }
    const { error: pErr } = await supabase
      .from("profiles")
      .insert({ couple_id: couple.id, auth_user_id: userId, name: name.trim(), relationship });
    setBusy(false);
    if (pErr) { toast.error(pErr.message); return; }
    toast.success("You're connected with your partner 💛");
    finish();
  };

  return (
    <div className="mx-auto max-w-lg px-5 py-10">
      <p className="eyebrow">Welcome</p>
      <h1 className="mt-1 text-2xl">Set up your 100 days</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Start a fresh challenge, join your partner with their code, or explore the demo journey.
      </p>

      <div className="surface mt-6 space-y-3 p-5">
        <h2 className="text-base">About you</h2>
        <label className="block text-sm">
          <span className="text-muted-foreground">Your name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 outline-none focus:border-primary"
          />
        </label>
        <div className="flex gap-2">
          {["me", "wife"].map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRelationship(r)}
              className={`flex-1 rounded-xl border px-3 py-2 text-sm capitalize ${
                relationship === r ? "border-primary bg-primary/10 font-medium" : "border-input"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="surface mt-4 space-y-3 p-5">
        <h2 className="text-base">Start a new challenge</h2>
        <label className="block text-sm">
          <span className="text-muted-foreground">Challenge name (optional)</span>
          <input
            value={coupleName}
            onChange={(e) => setCoupleName(e.target.value)}
            placeholder="e.g. Our 100 Days"
            className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 outline-none focus:border-primary"
          />
        </label>
        <button
          disabled={busy}
          onClick={createCouple}
          className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          Start Day 1 today
        </button>
      </div>

      <div className="surface mt-4 space-y-3 p-5">
        <h2 className="text-base">Join your partner</h2>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Invite code"
          className="w-full rounded-xl border border-input bg-background px-3 py-2.5 uppercase outline-none focus:border-primary"
        />
        <button
          disabled={busy}
          onClick={joinCouple}
          className="w-full rounded-xl border border-input py-2.5 text-sm font-semibold disabled:opacity-60"
        >
          Join challenge
        </button>
      </div>

      {demoProfiles.data && demoProfiles.data.length > 0 ? (
        <div className="surface mt-4 space-y-3 p-5">
          <h2 className="text-base">Explore the demo</h2>
          <p className="text-sm text-muted-foreground">
            Jump into the Alex &amp; Priya demo challenge with 9 days of history already filled in.
          </p>
          <div className="flex flex-wrap gap-2">
            {demoProfiles.data.map((p) => (
              <button
                key={p.id}
                disabled={busy}
                onClick={() => claim(p.id)}
                className="rounded-xl border border-input px-4 py-2 text-sm font-medium disabled:opacity-60"
              >
                Continue as {p.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
