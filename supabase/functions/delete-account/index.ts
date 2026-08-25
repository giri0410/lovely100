/**
 * Account deletion for 100 Days Together.
 *
 * Apple requires any app offering account creation to offer in-app deletion
 * (App Store Review Guideline 5.1.1(v)), and Google has an equivalent data
 * deletion requirement. Deleting an auth user needs the service-role key, so
 * this cannot run in the client — and it is an Edge Function rather than a
 * TanStack server function because a packaged mobile app has no server to call.
 *
 * The caller proves who they are with their own access token. There is no way
 * to ask this function to delete somebody else: the id comes from the verified
 * token, never from the request body.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function admin(path: string, init: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (request.method !== "POST") return json({ error: "method not allowed" }, 405);

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ error: "server not configured" }, 500);
  }

  const authorization = request.headers.get("Authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "not signed in" }, 401);

  // Verify the token by asking the auth server who it belongs to. This is the
  // only place the user id comes from.
  const whoami = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY || SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` },
  });
  if (!whoami.ok) return json({ error: "session is not valid" }, 401);

  const user = (await whoami.json()) as { id?: string };
  const userId = user.id;
  if (!userId) return json({ error: "session is not valid" }, 401);

  // Remove the member first. Habits, avoided expenses, weekly reviews and
  // reminders all reference it ON DELETE CASCADE, so this clears the person's
  // own history in one statement. Their partner's rows are untouched.
  const memberDelete = await admin(`/rest/v1/members?auth_user_id=eq.${userId}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
  if (!memberDelete.ok) {
    return json({ error: "could not remove your challenge data", detail: await memberDelete.text() }, 500);
  }

  // Any admin role grant would be orphaned otherwise.
  await admin(`/rest/v1/user_roles?user_id=eq.${userId}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });

  // Finally the login itself. Done last so a failure here leaves an account
  // that can still sign in and retry, rather than orphaned data.
  const userDelete = await admin(`/auth/v1/admin/users/${userId}`, { method: "DELETE" });
  if (!userDelete.ok) {
    return json({ error: "could not delete your account", detail: await userDelete.text() }, 500);
  }

  return json({ deleted: true });
});
