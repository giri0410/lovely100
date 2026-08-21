import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { auth } from "@/data";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Set a new password — 100 Days Together" },
      { name: "description", content: "Choose a new password for your 100 Days Together account." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState<"checking" | "ok" | "invalid">("checking");

  // Supabase turns the recovery link into a session as the client boots, so
  // wait for that before deciding whether this link is still good.
  useEffect(() => {
    let active = true;
    const unsubscribe = auth.onChange((userId) => {
      if (active && userId) setReady("ok");
    });
    auth.getSession().then(({ userId }) => {
      if (!active) return;
      setReady(userId ? "ok" : "invalid");
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("The two passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      await auth.updatePassword(password);
      toast.success("Password updated. You're signed in.");
      navigate({ to: "/today" });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center">
          <p className="eyebrow">100 Days</p>
          <h1 className="mt-1 font-display text-3xl">Set a new password</h1>
        </div>

        {ready === "checking" ? (
          <p className="mt-7 text-center text-sm text-muted-foreground">Checking your link…</p>
        ) : ready === "invalid" ? (
          <div className="surface mt-7 p-5 text-center">
            <p className="text-sm text-muted-foreground">
              This link has expired or has already been used. Request a new one from the sign-in page.
            </p>
            <button
              type="button"
              onClick={() => navigate({ to: "/auth" })}
              className="mt-5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="surface mt-7 space-y-3 p-5">
            <label className="block text-sm">
              <span className="text-muted-foreground">New password</span>
              <input
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 outline-none focus:border-primary"
              />
            </label>
            <label className="block text-sm">
              <span className="text-muted-foreground">Confirm new password</span>
              <input
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 outline-none focus:border-primary"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {busy ? "Saving…" : "Save new password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
