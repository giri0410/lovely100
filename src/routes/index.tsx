import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { auth } from "@/data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "100 Days Together — A Couple's Habit Challenge" },
      {
        name: "description",
        content:
          "A 100-day challenge for two: morning walks, healthy food, mindful spending and daily certification study — tracked together.",
      },
      { property: "og:title", content: "100 Days Together — A Couple's Habit Challenge" },
      {
        property: "og:description",
        content: "Small habits. Better health. Stronger discipline. Together for 100 days.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const PILLARS = [
  { emoji: "🚶", title: "Morning Walk", copy: "30 minutes to start the day awake and together." },
  { emoji: "🥗", title: "Healthy Food", copy: "Follow the plan Monday to Saturday. Sunday is your cheat day — at home." },
  { emoji: "💸", title: "Mindful Spending", copy: "Log what you chose not to buy and watch it add up." },
  { emoji: "📘", title: "Certification", copy: "30 minutes of learning, every single day." },
];

function Landing() {
  const navigate = useNavigate();

  useEffect(() => {
    auth.getSession().then(({ userId }) => {
      if (userId) navigate({ to: "/today" });
    });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-3xl px-6 py-16">
        <section className="animate-rise text-center">
          <p className="eyebrow">A challenge for two</p>
          <h1 className="mt-3 font-display text-4xl leading-tight sm:text-5xl">100 Days Together</h1>
          <p className="mx-auto mt-4 max-w-md text-muted-foreground">
            Small habits. Better health. Stronger discipline. Together.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              to="/auth"
              className="rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-soft)]"
            >
              Start our 100 days
            </Link>
            <Link to="/auth" className="rounded-full border border-input px-6 py-3 text-sm font-medium">
              I already have an account
            </Link>
          </div>
        </section>

        <section className="mt-14 grid gap-4 sm:grid-cols-2">
          {PILLARS.map((p) => (
            <article key={p.title} className="surface p-5">
              <p className="text-2xl">{p.emoji}</p>
              <h2 className="mt-2 text-lg">{p.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{p.copy}</p>
            </article>
          ))}
        </section>

        <section className="surface mt-8 p-6 text-center">
          <h2 className="text-xl">One team, never a scoreboard</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Both of you check off the same four habits each day. You'll see each other's progress, a shared team score,
            streaks, money you didn't spend and every hour you studied — with 30 seconds of effort a day.
          </p>
        </section>
      </main>
    </div>
  );
}
