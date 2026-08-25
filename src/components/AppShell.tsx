import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { CalendarDays, Camera, Home, NotebookPen, PiggyBank, Settings, Sparkles, Target, TrendingUp } from "lucide-react";
import { useChallengeData, useMyMember, useSession } from "@/hooks/useChallenge";
import { buildProgress, type JourneyProgress } from "@/lib/progress";
import { copy, type Copy } from "@/lib/copy";
import type { ChallengeData } from "@/hooks/useChallenge";
import type { Member } from "@/lib/challenge";
import { cn } from "@/lib/utils";

/** The five primary destinations — also the mobile bottom bar. */
const NAV = [
  { to: "/today", label: "Today", icon: Home },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/stats", label: "Stats", icon: TrendingUp },
  { to: "/money", label: "Money", icon: PiggyBank },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

/**
 * Read less often, and deliberately kept out of the mobile bar — six or seven
 * tabs on a phone makes the primary five harder to hit. On mobile these are
 * reached from the Today and Stats pages instead.
 */
const SECONDARY_NAV = [
  { to: "/goals", label: "Your goals", icon: Target },
  { to: "/memories", label: "Memories", icon: Camera },
  { to: "/review", label: "Weekly review", icon: NotebookPen },
  { to: "/summary", label: "The whole story", icon: Sparkles },
] as const;

export interface AppContext {
  me: Member;
  data: ChallengeData;
  progress: JourneyProgress;
  /** Solo/shared wording, resolved once here so no screen branches inline. */
  t: Copy;
  /**
   * The other member, when there is one. Named `partner` historically; it is
   * simply "somebody else in this journey" and is undefined for solo.
   */
  partner: Member | undefined;
  /** This member's own progress — the common case for every screen. */
  mine: JourneyProgress["members"][number] | undefined;
}

export function AppShell({ children }: { children: (ctx: AppContext) => ReactNode }) {
  const navigate = useNavigate();
  const { userId, loading } = useSession();
  const meQuery = useMyMember(userId);
  const dataQuery = useChallengeData(meQuery.data?.journey_id);
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
    const progress = buildProgress(data.journey, data.members, data.goals, data.logs);
    body = children({
      me: meQuery.data,
      data,
      progress,
      t: copy({ kind: data.journey.kind, memberCount: data.members.length }),
      partner: data.members.find((p) => p.id !== meQuery.data!.id),
      mine: progress.members.find((m) => m.member.id === meQuery.data!.id),
    });
  } else {
    body = <div className="p-10 text-center text-sm text-muted-foreground">Setting things up…</div>;
  }

  return (
    <div className="min-h-screen bg-background md:flex">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-sidebar p-6 md:flex">
        <div>
          <h1 className="font-display text-xl leading-tight">Lovely 100</h1>
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

          <div className="mt-6 border-t border-sidebar-border pt-4">
            {SECONDARY_NAV.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
                  pathname === to
                    ? "bg-sidebar-accent font-medium text-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {label}
              </Link>
            ))}
          </div>
        </nav>
        <p className="text-xs text-muted-foreground">Small habits, kept.</p>
      </aside>

      <main className="mx-auto w-full max-w-3xl flex-1 pb-24 md:pb-10">{body}</main>

      {/* The bar sits at the very bottom of the viewport, which on a notched
          phone is underneath the home indicator. The inset padding lifts the
          tap targets clear of it; it resolves to 0 everywhere else. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
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
      <p className="eyebrow">Lovely 100</p>
      <h1 className="mt-1 text-2xl">{title}</h1>
      {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
    </header>
  );
}
