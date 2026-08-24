import { createFileRoute, Link } from "@tanstack/react-router";

/**
 * Required by both app stores, and it has to be reachable without signing in —
 * App Store Connect wants a public URL it can open.
 *
 * Everything here was written against what the code actually does. If data
 * handling changes, this page changes with it.
 */

// The address people can actually reach you on. Apple checks that contact
// details work, so keep this current.
const CONTACT_EMAIL = "girimanikandan.m@gmail.com";
const LAST_UPDATED = "24 August 2026";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Lovely 100" },
      {
        name: "description",
        content: "What Lovely 100 collects, what your partner can see, and how to delete it all.",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-12">
      <p className="eyebrow">Lovely 100</p>
      <h1 className="mt-1 font-display text-3xl">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated {LAST_UPDATED}</p>

      <div className="mt-8 space-y-6">
        <Section title="The short version">
          <p>
            This is a habit tracker for two people. It stores what you log so the app can show your progress,
            and shares it with the partner you invite. There is no advertising, no analytics, no tracking, and
            nothing is sold or shared for marketing. You can delete everything from inside the app at any time.
          </p>
        </Section>

        <Section title="What we store">
          <p>Only what the app needs to work:</p>
          <List
            items={[
              "Your email address and password, to sign you in. The password is hashed by our authentication provider — we never see it.",
              "Your display name and the relationship label you choose.",
              "Your daily habit entries: which of the four habits you completed, minutes walked, minutes studied and the topic, and any notes.",
              "Avoided expenses you log: the amount, what it was for, and why you skipped it.",
              "Your weekly review notes.",
              "Your reminder preferences and times.",
              "The challenge itself: its name, start date and invite code.",
            ]}
          />
          <p>
            We do not collect your location, contacts, photos, device identifiers for advertising, or any health
            data from Apple Health or Google Fit.
          </p>
        </Section>

        <Section title="What your partner can see" tone="warm">
          <p>
            This is the part worth reading twice. When you join a challenge with someone, the two of you share
            it — and they can see:
          </p>
          <List
            items={[
              "Which habits you completed, on every day of the challenge.",
              "Your walking minutes and your study minutes and topics.",
              "Every avoided expense you log, including the amount, the description and your reason.",
              "Your weekly review notes.",
            ]}
          />
          <p>
            Treat anything you log as something you are telling your partner. Nobody outside your challenge can
            see any of it — that is enforced by the database itself, not just by the app.
          </p>
        </Section>

        <Section title="Who else handles it">
          <p>
            We use a small number of services to run the app. They process your data on our behalf and are not
            allowed to use it for anything else.
          </p>
          <List
            items={[
              "Supabase — stores the database and handles sign-in.",
              "Cloudflare — serves the website.",
              "SendGrid — sends reminder emails, if you turn reminders on.",
              "Google Fonts — the app loads its typefaces from Google's servers, which means Google sees your IP address when a page loads.",
              "Apple — if you installed this from the App Store, Apple handles the download and any crash reports you have opted into at the device level.",
            ]}
          />
        </Section>

        <Section title="What we don't do">
          <List
            items={[
              "No advertising, and no ad networks.",
              "No analytics or usage tracking of any kind.",
              "No selling or renting your data. Ever.",
              "No emails other than the reminders you asked for, and account emails like password resets.",
            ]}
          />
        </Section>

        <Section title="Deleting your data">
          <p>
            Open <span className="font-medium text-foreground">Settings</span> and choose{" "}
            <span className="font-medium text-foreground">Delete account</span>. That removes your login and
            your side of the challenge — habits, avoided expenses, reviews and reminders — permanently and
            straight away. It cannot be undone.
          </p>
          <p>
            Your partner's own entries stay with them, because they are theirs. If you would rather we handled
            it, email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline-offset-4 hover:underline">
              {CONTACT_EMAIL}
            </a>{" "}
            and we will delete your account for you.
          </p>
          <p>
            While your account exists, we keep your entries so the app can show your history. We do not keep
            backups of deleted accounts beyond our provider's routine backup window.
          </p>
        </Section>

        <Section title="Children">
          <p>
            This app is not intended for children under 13, and we do not knowingly collect their data. If you
            believe a child has created an account, email us and we will remove it.
          </p>
        </Section>

        <Section title="Changes">
          <p>
            If this policy changes in a way that affects what we collect or who sees it, we will update the date
            at the top and tell you in the app before the change takes effect.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions, or want your data removed? Email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline-offset-4 hover:underline">
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </Section>
      </div>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link to="/" className="rounded-xl border border-input px-4 py-2.5 text-sm font-medium">
          Back to the app
        </Link>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
  tone,
}: {
  title: string;
  children: React.ReactNode;
  tone?: "warm";
}) {
  return (
    <section className={`surface p-5 ${tone === "warm" ? "bg-warm/10 border-warm/40" : ""}`}>
      <h2 className="text-lg">{title}</h2>
      <div className="mt-2 space-y-3 text-sm text-muted-foreground">{children}</div>
    </section>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <span aria-hidden="true" className="text-primary">
            ·
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
