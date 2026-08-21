/**
 * Reminder delivery for 100 Days Together.
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
 * Volume note: a reminder is skipped when the habit it is about is already
 * done, so an engaged couple generates very little mail. Worst case is one
 * email per enabled reminder per person per day.
 */

interface DueReminder {
  profile_id: string;
  profile_name: string;
  email: string;
  reminder_type: string;
  couple_name: string;
  local_date: string;
  day_number: number;
  week_number: number;
  walk_done: boolean;
  food_done: boolean;
  spending_done: boolean;
  cert_done: boolean;
  done_count: number;
  partner_name: string | null;
  partner_done_count: number;
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
    case "walk":
      return !r.walk_done;
    case "certification":
      return !r.cert_done;
    case "daily":
      return r.done_count < 4;
    case "weekly":
      return true; // the review is worth writing even after a perfect week
    default:
      return r.done_count < 4;
  }
}

function subjectFor(r: DueReminder): string {
  switch (r.reminder_type) {
    case "walk":
      return `Day ${r.day_number} — time for your walk`;
    case "certification":
      return `Day ${r.day_number} — 30 minutes of study`;
    case "weekly":
      return `Week ${r.week_number} review — how did it go?`;
    default:
      return r.done_count === 0
        ? `Day ${r.day_number} — nothing logged yet`
        : `Day ${r.day_number} — ${4 - r.done_count} left to go`;
  }
}

const REMAINING_LABELS: { key: keyof DueReminder; label: string }[] = [
  { key: "walk_done", label: "Morning walk" },
  { key: "food_done", label: "Healthy food" },
  { key: "spending_done", label: "No unnecessary spending" },
  { key: "cert_done", label: "Certification study" },
];

function bodyFor(r: DueReminder): string {
  const remaining = REMAINING_LABELS.filter((h) => !r[h.key]).map((h) => h.label);
  const lines: string[] = [`Hi ${r.profile_name},`, ""];

  if (r.reminder_type === "weekly") {
    lines.push(
      `Week ${r.week_number} of ${r.couple_name} is done. Take two minutes to note what went well and what you'd change.`,
    );
    lines.push("", `${APP_URL}/review`);
  } else if (r.reminder_type === "walk") {
    lines.push("Your walk is still open for today. Thirty minutes is all it asks.");
    lines.push("", `${APP_URL}/today`);
  } else if (r.reminder_type === "certification") {
    lines.push("Study time. Thirty minutes counts, and today still has room for it.");
    lines.push("", `${APP_URL}/today`);
  } else {
    lines.push(
      remaining.length === 4
        ? `Day ${r.day_number} hasn't been logged yet. There's still time for all four.`
        : `You're ${r.done_count} of 4 on day ${r.day_number}. Still open: ${remaining.join(", ")}.`,
    );
    // Only mention the partner when it's encouraging. Never as a comparison.
    if (r.partner_name && r.partner_done_count === 4) {
      lines.push("", `${r.partner_name} has finished today — you're one tick from a day together.`);
    }
    lines.push("", `${APP_URL}/today`);
  }

  lines.push("", "— 100 Days Together", "Change your reminder times in Settings.");
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
      from: { email: SENDGRID_FROM, name: "100 Days Together" },
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
  await db("reminder_sends?on_conflict=profile_id,reminder_type,sent_for_date", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify({
      profile_id: r.profile_id,
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
