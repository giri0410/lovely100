import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as api from "@/data";
import { useMyProfile, useSession } from "@/hooks/useChallenge";
import type { JourneyKind } from "@/lib/copy";

export const Route = createFileRoute("/onboarding")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Set up your 100 days — Lovely 100" },
      { name: "description", content: "Start your own 100 days, or join someone else's with their invite code." },
      { property: "og:title", content: "Set up your 100 days — Lovely 100" },
      { property: "og:description", content: "Set your goals and start Day 1 today." },
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
  const [relationship, setRelationship] = useState("");
  const [coupleName, setCoupleName] = useState("");
  const [kind, setKind] = useState<JourneyKind>("solo");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !userId) navigate({ to: "/auth" });
  }, [loading, userId, navigate]);

  useEffect(() => {
    if (meQuery.data) navigate({ to: "/today" });
  }, [meQuery.data, navigate]);

  const finish = async () => {
    await qc.invalidateQueries({ queryKey: ["my-profile"] });
    navigate({ to: "/today" });
  };

  const createCouple = async () => {
    if (!name.trim()) { toast.error("Add your name first"); return; }
    setBusy(true);
    try {
      await api.createCouple({
        userId: userId!,
        name: name.trim(),
        coupleName: coupleName.trim(),
        relationship,
        kind,
      });
      toast.success(
        kind === "shared"
          ? "Created — share your invite code from Settings."
          : "Created — Day 1 starts today!",
      );
      finish();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const joinCouple = async () => {
    if (!name.trim() || !code.trim()) { toast.error("Add your name and the invite code"); return; }
    setBusy(true);
    try {
      await api.joinCouple({ userId: userId!, name: name.trim(), relationship, inviteCode: code });
      toast.success("You're in — you're doing this together now 💛");
      finish();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg px-5 py-10">
      <p className="eyebrow">Welcome</p>
      <h1 className="mt-1 text-2xl">Set up your 100 days</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Start your own 100 days, or join someone else's with their invite code.
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
        {/* Free text, not a two-option toggle. The old ["me","wife"] picker was
            wrong for most couples and meaningless for someone going solo. */}
        <label className="block text-sm">
          <span className="text-muted-foreground">How should we refer to you? (optional)</span>
          <input
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
            placeholder="e.g. partner, husband, girlfriend, me"
            className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 outline-none focus:border-primary"
          />
        </label>
      </div>

      <div className="surface mt-4 space-y-3 p-5">
        <h2 className="text-base">Start your 100 days</h2>

        <div className="flex gap-2" role="group" aria-label="Who is this for">
          {(
            [
              { value: "solo", label: "Just me" },
              { value: "shared", label: "With someone" },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={kind === option.value}
              onClick={() => setKind(option.value)}
              className={`flex-1 rounded-xl border px-3 py-2 text-sm ${
                kind === option.value ? "border-primary bg-primary/10 font-medium" : "border-input"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {kind === "solo"
            ? "You can invite someone later — it stays yours until you do."
            : "You'll get an invite code to share once this is created."}
        </p>

        <label className="block text-sm">
          <span className="text-muted-foreground">Name it (optional)</span>
          <input
            value={coupleName}
            onChange={(e) => setCoupleName(e.target.value)}
            placeholder={kind === "shared" ? "e.g. Our 100 Days" : "e.g. My 100 Days"}
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
        <h2 className="text-base">Join someone else's</h2>
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
          Join their 100 days
        </button>
      </div>

    </div>
  );
}
