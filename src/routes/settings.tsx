import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell, PageHeader } from "@/components/AppShell";
import * as api from "@/data";
import { useReminders } from "@/hooks/useChallenge";
import { Switch } from "@/components/ui/switch";
import type { Couple, Profile } from "@/lib/challenge";
import {
  applyThemePreference,
  readThemePreference,
  watchSystemTheme,
  type ThemePreference,
} from "@/lib/theme";

export const Route = createFileRoute("/settings")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Settings — 100 Days Together" },
      { name: "description", content: "Manage your profile, challenge start date, partner invite code and daily reminders." },
      { property: "og:title", content: "Settings — 100 Days Together" },
      { property: "og:description", content: "Profile, challenge and reminder settings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

function AppearanceSection() {
  const [theme, setTheme] = useState<ThemePreference>("system");

  // Read on mount rather than in useState, so server render and first client
  // render agree and React doesn't warn about a hydration mismatch.
  useEffect(() => setTheme(readThemePreference()), []);

  // While on "system", follow the OS if it changes under us.
  useEffect(() => {
    if (theme !== "system") return;
    return watchSystemTheme(() => applyThemePreference("system"));
  }, [theme]);

  const choose = (next: ThemePreference) => {
    setTheme(next);
    applyThemePreference(next);
  };

  return (
    <section className="surface space-y-3 p-5">
      <div>
        <h2 className="text-lg">Appearance</h2>
        <p className="text-sm text-muted-foreground">Match your system, or pick one and stay there.</p>
      </div>
      <div className="flex gap-2" role="group" aria-label="Theme">
        {THEME_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={theme === option.value}
            onClick={() => choose(option.value)}
            className={`flex-1 rounded-xl border px-3 py-2 text-sm ${
              theme === option.value ? "border-primary bg-primary/10 font-medium" : "border-input"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </section>
  );
}

const REMINDER_TYPES = [
  { type: "walk", label: "Morning walk", time: "06:30" },
  { type: "certification", label: "Certification study", time: "20:00" },
  { type: "daily", label: "Daily habit check-in", time: "21:30" },
  { type: "weekly", label: "Sunday weekly review", time: "18:00" },
];

function SettingsPage() {
  return <AppShell>{({ me, data }) => <SettingsView me={me} couple={data.couple} />}</AppShell>;
}

function SettingsView({ me, couple }: { me: Profile; couple: Couple }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState(me.name);
  const [coupleName, setCoupleName] = useState(couple.name);
  const [startDate, setStartDate] = useState(couple.start_date);
  const reminders = useReminders(me.id);

  const saveProfile = useMutation({
    mutationFn: () => api.updateProfileName(me.id, name),
    onSuccess: () => {
      toast.success("Profile updated");
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveCouple = useMutation({
    mutationFn: () => api.updateCouple(couple.id, { name: coupleName, start_date: startDate }),
    onSuccess: () => {
      toast.success("Challenge updated");
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveReminder = useMutation({
    mutationFn: ({ type, enabled, time }: { type: string; enabled: boolean; time: string }) =>
      api.upsertReminder({ profileId: me.id, type, enabled, time }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reminders", me.id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const signOut = async () => {
    await api.auth.signOut();
    qc.clear();
    navigate({ to: "/auth" });
  };

  return (
    <div className="space-y-5 px-5 pb-8">
      <PageHeader title="Settings" subtitle="Keep the challenge yours." />

      <section className="surface space-y-3 p-5">
        <h2 className="text-lg">Your profile</h2>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-xl border border-input bg-background px-3 py-2.5 outline-none focus:border-primary"
        />
        <p className="text-sm text-muted-foreground capitalize">Role: {me.relationship}</p>
        <button
          onClick={() => saveProfile.mutate()}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          Save profile
        </button>
      </section>

      <section className="surface space-y-3 p-5">
        <h2 className="text-lg">The challenge</h2>
        <label className="block text-sm">
          <span className="text-muted-foreground">Challenge name</span>
          <input
            value={coupleName}
            onChange={(e) => setCoupleName(e.target.value)}
            className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 outline-none focus:border-primary"
          />
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">Start date (Day 1)</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 outline-none focus:border-primary"
          />
        </label>
        <p className="text-sm text-muted-foreground">Duration: {couple.duration} days · always exactly 100 days.</p>
        <div className="rounded-xl bg-secondary/60 p-3 text-sm">
          <p className="eyebrow">Partner invite code</p>
          <p className="font-display text-2xl tracking-widest">{couple.invite_code}</p>
          <p className="text-xs text-muted-foreground">Share this so your partner can join the same challenge.</p>
        </div>
        {couple.is_demo ? (
          <p className="text-xs text-muted-foreground">Demo challenges can't be renamed.</p>
        ) : (
          <button
            onClick={() => saveCouple.mutate()}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Save challenge
          </button>
        )}
      </section>

      <section className="surface space-y-4 p-5">
        <div>
          <h2 className="text-lg">Reminders</h2>
          <p className="text-sm text-muted-foreground">Choose your own times — nothing is hardcoded.</p>
        </div>
        {REMINDER_TYPES.map((r) => {
          const saved = reminders.data?.find((x) => x.reminder_type === r.type);
          const enabled = saved?.enabled ?? false;
          const time = (saved?.reminder_time ?? r.time).slice(0, 5);
          return (
            <div key={r.type} className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{r.label}</p>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => saveReminder.mutate({ type: r.type, enabled, time: e.target.value })}
                  className="mt-1 rounded-lg border border-input bg-background px-2 py-1 text-sm"
                />
              </div>
              <Switch
                checked={enabled}
                onCheckedChange={(v) => saveReminder.mutate({ type: r.type, enabled: v, time })}
              />
            </div>
          );
        })}
      </section>

      <AppearanceSection />

      <Link
        to="/admin"
        className="block w-full rounded-xl border border-input py-2.5 text-center text-sm font-medium"
      >
        Admin console
      </Link>

      <button onClick={signOut} className="w-full rounded-xl border border-input py-2.5 text-sm font-medium">
        Sign out
      </button>

    </div>
  );
}
