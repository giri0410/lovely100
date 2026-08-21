import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { auth } from "@/data";

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
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    auth.getSession().then(({ userId }) => {
      if (userId) navigate({ to: "/today" });
    });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "forgot") {
        await auth.requestPasswordReset(email);
        setSent(true);
      } else if (mode === "signup") {
        await auth.signUp(email, password);
        toast.success("Account created. Let's set up your challenge.");
        navigate({ to: "/onboarding" });
      } else {
        await auth.signIn(email, password);
        navigate({ to: "/onboarding" });
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const heading =
    mode === "forgot" ? "Reset your password" : mode === "signup" ? "Create your account" : "Welcome back";

  if (mode === "forgot" && sent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
        <div className="w-full max-w-sm text-center">
          <p className="eyebrow">100 Days</p>
          <h1 className="mt-1 font-display text-3xl">Check your email</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            If an account exists for <span className="font-medium text-foreground">{email}</span>, we've sent a
            link to set a new password. It expires in an hour.
          </p>
          <button
            type="button"
            onClick={() => {
              setMode("signin");
              setSent(false);
            }}
            className="mt-6 rounded-xl border border-input px-5 py-2.5 text-sm font-medium"
          >
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center">
          <p className="eyebrow">100 Days</p>
          <h1 className="mt-1 font-display text-3xl">{heading}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {mode === "forgot"
              ? "Enter your email and we'll send you a link to set a new one."
              : "Small habits. Better health. Stronger discipline. Together."}
          </p>
        </div>

        <form onSubmit={submit} className="surface mt-7 space-y-3 p-5">
          <label className="block text-sm">
            <span className="text-muted-foreground">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 outline-none focus:border-primary"
            />
          </label>
          {mode !== "forgot" ? (
            <label className="block text-sm">
              <span className="text-muted-foreground">Password</span>
              <input
                type="password"
                required
                minLength={6}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 outline-none focus:border-primary"
              />
            </label>
          ) : null}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {busy
              ? "Please wait…"
              : mode === "forgot"
                ? "Send reset link"
                : mode === "signin"
                  ? "Sign in"
                  : "Create account"}
          </button>
          {mode === "signin" ? (
            <button
              type="button"
              onClick={() => setMode("forgot")}
              className="w-full text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Forgot your password?
            </button>
          ) : null}
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          {mode === "forgot" ? (
            <button
              type="button"
              className="font-medium text-primary underline-offset-4 hover:underline"
              onClick={() => setMode("signin")}
            >
              Back to sign in
            </button>
          ) : (
            <>
              {mode === "signin" ? "New here?" : "Already have an account?"}{" "}
              <button
                type="button"
                className="font-medium text-primary underline-offset-4 hover:underline"
                onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              >
                {mode === "signin" ? "Create an account" : "Sign in"}
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
