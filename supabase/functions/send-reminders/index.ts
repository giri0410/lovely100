/**
 * Reminder delivery for Lovely 100.
 *
 * Invoked every 5 minutes by pg_cron. Asks the database which reminders fell
 * due in that window, decides whether each one is still worth sending, mails
 * the ones that are, and records every decision so nothing goes out twice.
 *
 * Why an Edge Function rather than a TanStack server function: this is
 * reachable from a Capacitor WebView and from cron, and it survives the app
 * being packaged as a static mobile bundle. Swapping email for native push
 * later means changing `deliver()` and nothing else.
 *
 * Volume note: a reminder is skipped when the goal it is about is already
 * done, so someone keeping up generates very little mail. Worst case is one
 * email per enabled reminder per person per day — and since reminders are now
 * per-goal, that ceiling rises with the number of goals somebody sets a
 * reminder on, not with a fixed four.
 */

interface DueReminder {
  member_id: string;
  member_name: string;
  email: string;
  /** 'goal' | 'daily' | 'weekly'. */
  reminder_type: string;
  /** Set only for a 'goal' reminder. */
  goal_id: string | null;
  goal_title: string | null;
  goal_unit: string | null;
  goal_target: number | null;
  goal_done: boolean | null;
  journey_name: string;
  local_date: string;
  day_number: number;
  week_number: number;
  /** Daily goals running today, and how many are met. Never a hardcoded 4. */
  goals_total: number;
  goals_done: number;
  /**
   * Titles still open, straight from the goals table. This is what replaced
   * REMAINING_LABELS — the fifth and last duplicated label list in the
   * codebase.
   */
  open_titles: string[];
  /** Everyone else in the journey, aggregated — not one arbitrary member. */
  others_count: number;
  others_all_done: boolean;
}

type Outcome = { status: "sent" | "skipped" | "failed"; detail?: string };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SENDGRID_API_KEY = Deno.env.get("SENDGRID_API_KEY") ?? "";
const SENDGRID_FROM = Deno.env.get("SENDGRID_FROM") ?? "";
const CRON_SECRET = Deno.env.get("REMINDER_CRON_SECRET") ?? "";
const APP_URL = Deno.env.get("APP_URL") ?? "https://lovely100.girimanikandan-m.workers.dev";

/** Window must match the cron interval, plus a little slack for a slow run. */
const WINDOW_MINUTES = 6;

function db(path: string, init: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

/**
 * Whether this reminder still has something to say. A nudge about a habit you
 * already finished is worse than no nudge at all — it trains people to ignore
 * the emails.
 */
function shouldSend(r: DueReminder): boolean {
  switch (r.reminder_type) {
    case "goal":
      return !r.goal_done;
    case "daily":
      // Nothing to chase when every goal running today is already done — and
      // nothing to chase when none are running at all.
      return r.goals_total > 0 && r.goals_done < r.goals_total;
    case "weekly":
      return true; // the review is worth writing even after a perfect week
    default:
      return false;
  }
}

function subjectFor(r: DueReminder): string {
  switch (r.reminder_type) {
    case "goal":
      return `Day ${r.day_number} — ${r.goal_title}`;
    case "weekly":
      return `Week ${r.week_number} review — how did it go?`;
    default: {
      const left = r.goals_total - r.goals_done;
      return r.goals_done === 0
        ? `Day ${r.day_number} — nothing logged yet`
        : `Day ${r.day_number} — ${left} left to go`;
    }
  }
}

/** "a, b and c" — for listing open goals without reading like a database. */
function joinTitles(titles: string[]): string {
  if (titles.length <= 1) return titles[0] ?? "";
  return `${titles.slice(0, -1).join(", ")} and ${titles[titles.length - 1]}`;
}

function bodyFor(r: DueReminder): string {
  const lines: string[] = [`Hi ${r.member_name},`, ""];

  if (r.reminder_type === "weekly") {
    lines.push(
      `Week ${r.week_number} of ${r.journey_name} is done. Take two minutes to note what went well and what you'd change.`,
    );
    lines.push("", `${APP_URL}/review`);
  } else if (r.reminder_type === "goal") {
    // The goal's own title and unit, so this reads correctly for a goal the
    // app has never heard of.
    const target =
      r.goal_target !== null
        ? ` ${r.goal_target}${r.goal_unit ? ` ${r.goal_unit}` : ""} is all it asks.`
        : "";
    lines.push(`${r.goal_title} is still open for today.${target}`);
    lines.push("", `${APP_URL}/today`);
  } else {
    lines.push(
      r.goals_done === 0
        ? `Day ${r.day_number} hasn't been logged yet. Still open: ${joinTitles(r.open_titles)}.`
        : `You're ${r.goals_done} of ${r.goals_total} on day ${r.day_number}. Still open: ${joinTitles(r.open_titles)}.`,
    );
    // Mention the others only when it is encouraging, and never as a ranking.
    // others_all_done is an aggregate over everyone else, so this is honest for
    // a journey of two or of five.
    if (r.others_count > 0 && r.others_all_done) {
      lines.push(
        "",
        r.others_count === 1
          ? "The other half of your journey has finished today — you're close to a day together."
          : "Everyone else has finished today — you're close to a day together.",
      );
    }
    lines.push("", `${APP_URL}/today`);
  }

  lines.push("", "— Lovely 100", "Change your reminder times in Settings.");
  return lines.join("\n");
}

async function deliver(r: DueReminder): Promise<Outcome> {
  if (!SENDGRID_API_KEY || !SENDGRID_FROM) {
    return { status: "failed", detail: "SENDGRID_API_KEY or SENDGRID_FROM not configured" };
  }

  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SENDGRID_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: r.email }] }],
      from: { email: SENDGRID_FROM, name: "Lovely 100" },
      subject: subjectFor(r),
      content: [{ type: "text/plain", value: bodyFor(r) }],
      // Reminders are transactional, but people still deserve a way out.
      tracking_settings: { click_tracking: { enable: false } },
    }),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    return { status: "failed", detail: `sendgrid ${response.status}: ${detail}` };
  }
  return { status: "sent" };
}

async function record(r: DueReminder, outcome: Outcome): Promise<void> {
  // on_conflict do nothing: if a concurrent run already claimed this reminder,
  // that run owns it and we quietly stand down.
  // Two partial unique indexes cover this table, so the conflict target
  // depends on which kind of reminder this is: per-goal rows key on goal_id,
  // and the journey-level ones key on reminder_type.
  const target = r.goal_id
    ? "member_id,goal_id,sent_for_date"
    : "member_id,reminder_type,sent_for_date";

  await db(`reminder_sends?on_conflict=${target}`, {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify({
      member_id: r.member_id,
      goal_id: r.goal_id,
      reminder_type: r.reminder_type,
      sent_for_date: r.local_date,
      status: outcome.status,
      detail: outcome.detail ?? null,
    }),
  });
}

Deno.serve(async (request) => {
  // cron passes a shared secret. This is deliberately not the service-role key:
  // the schedule lives in the database, and a leaked cron secret can only cause
  // reminder emails, not data access.
  if (CRON_SECRET && request.headers.get("x-reminder-secret") !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "missing Supabase configuration" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const dueResponse = await db("rpc/reminders_due", {
    method: "POST",
    body: JSON.stringify({ _window_minutes: WINDOW_MINUTES }),
  });

  if (!dueResponse.ok) {
    const detail = await dueResponse.text();
    return new Response(JSON.stringify({ error: "reminders_due failed", detail }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const due = (await dueResponse.json()) as DueReminder[];
  const tally = { due: due.length, sent: 0, skipped: 0, failed: 0 };

  // Sequential on purpose: volume is tiny and it keeps us well inside any
  // provider rate limit.
  for (const reminder of due) {
    const outcome: Outcome = shouldSend(reminder)
      ? await deliver(reminder)
      : { status: "skipped", detail: "nothing outstanding" };

    await record(reminder, outcome);
    tally[outcome.status] += 1;
  }

  return new Response(JSON.stringify(tally), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
