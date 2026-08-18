import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { CalendarDays, Home, PiggyBank, Settings, TrendingUp } from "lucide-react";
import { useChallengeData, useMyProfile, useSession } from "@/hooks/useChallenge";
import { buildStats, type CoupleStats } from "@/lib/stats";
import type { ChallengeData } from "@/hooks/useChallenge";
import type { Profile } from "@/lib/challenge";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/today", label: "Today", icon: Home },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/stats", label: "Stats", icon: TrendingUp },
  { to: "/money", label: "Money", icon: PiggyBank },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export interface AppContext {
  me: Profile;
  data: ChallengeData;
  stats: CoupleStats;
  partner: Profile | undefined;
}

export function AppShell({ children }: { children: (ctx: AppContext) => ReactNode }) {
  const navigate = useNavigate();
  const { userId, loading } = useSession();
  const meQuery = useMyProfile(userId);
  const dataQuery = useChallengeData(meQuery.data?.couple_id);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!loading && !userId) navigate({ to: "/auth" });
  }, [loading, userId, navigate]);

  useEffect(() => {
    if (meQuery.isSuccess && !meQuery.data) navigate({ to: "/onboarding" });
  }, [meQuery.isSuccess, meQuery.data, navigate]);

  const busy = loading || meQuery.isLoading || dataQuery.isLoading;
  const error = meQuery.error || dataQuery.error;

  let body: ReactNode;
  if (busy) {
    body = (
      <div className="space-y-4 p-5">
        <div className="h-28 animate-pulse rounded-2xl bg-secondary" />
        <div className="h-40 animate-pulse rounded-2xl bg-secondary" />
        <div className="h-40 animate-pulse rounded-2xl bg-secondary" />
      </div>
    );
  } else if (error) {
    body = (
      <div className="surface m-5 p-6 text-center">
        <h2 className="text-lg">We couldn't load your challenge</h2>
        <p className="mt-2 text-sm text-muted-foreground">{(error as Error).message}</p>
        <button
          className="mt-4 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground"
          onClick={() => dataQuery.refetch()}
        >
          Try again
        </button>
      </div>
    );
  } else if (meQuery.data && dataQuery.data) {
    const data = dataQuery.data;
    const stats = buildStats(data.couple, data.profiles, data.habits, data.expenses);
    body = children({
      me: meQuery.data,
      data,
      stats,
      partner: data.profiles.find((p) => p.id !== meQuery.data!.id),
    });
  } else {
    body = <div className="p-10 text-center text-sm text-muted-foreground">Setting things up…</div>;
  }

  return (
    <div className="min-h-screen bg-background md:flex">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-sidebar p-6 md:flex">
        <div>
          <p className="eyebrow">100 Days</p>
          <h1 className="font-display text-xl leading-tight">Together</h1>
        </div>
        <nav className="mt-8 flex flex-1 flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                pathname === to
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>
        <p className="text-xs text-muted-foreground">Small habits. Together.</p>
      </aside>

      <main className="mx-auto w-full max-w-3xl flex-1 pb-24 md:pb-10">{body}</main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur md:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={cn(
                "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                pathname === to ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="size-5" />
              {label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="px-5 pb-2 pt-7">
      <p className="eyebrow">100 Days Together</p>
      <h1 className="mt-1 text-2xl">{title}</h1>
      {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
    </header>
  );
}
