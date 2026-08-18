import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { mockAuth } from "@/mock/api";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — 100 Days Together" },
      { name: "description", content: "Sign in to track your 100-day couple habit challenge for health, food, money and learning." },
      { property: "og:title", content: "Sign in — 100 Days Together" },
      { property: "og:description", content: "Sign in to your shared 100-day challenge." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    mockAuth.getSession().then(({ userId }) => {
      if (userId) navigate({ to: "/today" });
    });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        await mockAuth.signUp(email, password);
        toast.success("Account created. Let's set up your challenge.");
      } else {
        await mockAuth.signIn(email, password);
      }
      navigate({ to: "/onboarding" });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    await mockAuth.signInWithGoogle();
    navigate({ to: "/onboarding" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center">
          <p className="eyebrow">100 Days</p>
          <h1 className="mt-1 font-display text-3xl">Together</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Small habits. Better health. Stronger discipline. Together.
          </p>
        </div>

        <form onSubmit={submit} className="surface mt-7 space-y-3 p-5">
          <label className="block text-sm">
            <span className="text-muted-foreground">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 outline-none focus:border-primary"
            />
          </label>
          <label className="block text-sm">
            <span className="text-muted-foreground">Password</span>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 outline-none focus:border-primary"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
          <button
            type="button"
            onClick={google}
            className="w-full rounded-xl border border-input bg-background py-2.5 text-sm font-medium"
          >
            Continue with Google
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Demo mode — try <span className="font-medium">demo@100days.app</span> / <span className="font-medium">demo1234</span>
        </p>

        <p className="mt-3 text-center text-sm text-muted-foreground">
          {mode === "signin" ? "New here?" : "Already have an account?"}{" "}
          <button
            type="button"
            className="font-medium text-primary underline-offset-4 hover:underline"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          >
            {mode === "signin" ? "Create an account" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}
