import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { auth } from "@/data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Lovely 100 — 100 days, your goals" },
      {
        name: "description",
        content:
          "Set your own goals across health, cooking, travel, learning and money. Track 100 days solo or with someone, and keep the story.",
      },
      { property: "og:title", content: "Lovely 100 — 100 days, your goals" },
      {
        property: "og:description",
        content: "Pick what matters to you, show up for 100 days, and keep the story.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const PILLARS = [
  { emoji: "🚶", title: "Health", copy: "Walks, workouts, sleep — whatever moving well looks like for you." },
  { emoji: "🍳", title: "Cooking & food", copy: "Eat better, or work through the recipes you keep meaning to try." },
  { emoji: "✈️", title: "Places & memories", copy: "Log the trips, the small outings, the days worth keeping." },
  { emoji: "📘", title: "Learning & money", copy: "Study a little every day, and track what you chose not to spend." },
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
          <p className="eyebrow">100 days, your goals</p>
          <h1 className="mt-3 font-display text-4xl leading-tight sm:text-5xl">Lovely 100</h1>
          <p className="mx-auto mt-4 max-w-md text-muted-foreground">
            Pick what matters to you, show up for 100 days, and keep the story.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              to="/auth"
              className="rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-soft)]"
            >
              Start my 100 days
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
          <h2 className="text-xl">Do it alone, or bring someone</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Start on your own and it stays yours. Share an invite code and you'll see each other's progress and
            streaks — never a scoreboard. Either way it takes about 30 seconds a day, and at Day 100 you get the
            whole story back.
          </p>
        </section>
      </main>
    </div>
  );
}
