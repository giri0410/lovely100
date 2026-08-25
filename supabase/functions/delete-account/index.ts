/**
 * Account deletion for Lovely 100.
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

  // Find the member row before deleting anything, because everything else is
  // reached through it.
  const memberRes = await admin(`/rest/v1/members?auth_user_id=eq.${userId}&select=id,journey_id`);
  if (!memberRes.ok) {
    return json({ error: "could not look up your data", detail: await memberRes.text() }, 500);
  }
  const members = (await memberRes.json()) as { id: string; journey_id: string }[];
  const member = members[0];

  // Collect the storage paths BEFORE the rows go.
  //
  // media rows cascade away with the logs they hang off, but the objects in the
  // bucket do not — Postgres knows nothing about them. Deleting the account
  // without this step would leave the person's photos in storage for good,
  // which is the opposite of what the privacy policy promises.
  let paths: string[] = [];
  if (member) {
    // Two plain queries rather than one with an embedded-resource filter.
    // PostgREST's `logs!inner(member_id)` form works, but it puts `!`, `(` and
    // `)` in the query string, and a lookup that has to survive URL encoding
    // differences between runtimes is the wrong thing to hang photo deletion
    // on. log_id=in.(...) is unambiguous everywhere.
    const logsRes = await admin(`/rest/v1/logs?member_id=eq.${member.id}&select=id`);
    if (!logsRes.ok) {
      return json({ error: "could not find your photos", detail: await logsRes.text() }, 500);
    }
    const logIds = ((await logsRes.json()) as { id: string }[]).map((l) => l.id);

    if (logIds.length > 0) {
      const mediaRes = await admin(
        `/rest/v1/media?select=storage_path&log_id=in.(${logIds.join(",")})`,
      );
      // A failure here used to be swallowed, leaving paths empty and deleting
      // the account with every photo still in the bucket — silently, because
      // nothing downstream needed this to have worked. It is now fatal: better
      // to fail a deletion the user can retry than to report success while
      // keeping their photos.
      if (!mediaRes.ok) {
        return json({ error: "could not find your photos", detail: await mediaRes.text() }, 500);
      }
      paths = ((await mediaRes.json()) as { storage_path: string }[]).map((m) => m.storage_path);
    }
  }

  if (paths.length > 0) {
    // Storage first: if this fails, nothing has been destroyed yet and the
    // caller can retry. The other order would delete the index to files we
    // could then never find again.
    const removed = await admin(`/storage/v1/object/memories`, {
      method: "DELETE",
      body: JSON.stringify({ prefixes: paths }),
    });
    if (!removed.ok) {
      return json({ error: "could not delete your photos", detail: await removed.text() }, 500);
    }
  }

  // Remove the member. Logs, media rows, personal goals, avoided expenses,
  // weekly reviews, reminders and the old habit rows all reference it ON DELETE
  // CASCADE, so this clears the person's own history in one statement. Anyone
  // else's rows in the same journey are untouched.
  const memberDelete = await admin(`/rest/v1/members?auth_user_id=eq.${userId}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
  if (!memberDelete.ok) {
    return json({ error: "could not remove your journey data", detail: await memberDelete.text() }, 500);
  }

  // If nobody is left, the journey goes too.
  //
  // Goals shared across a journey have no owner_member_id, so they do not
  // cascade with any one member. Left alone, a solo account deletion would
  // leave a journey nobody can ever reach — RLS resolves access through a
  // member row — holding goals indefinitely after a deletion request.
  if (member) {
    const remaining = await admin(
      `/rest/v1/members?journey_id=eq.${member.journey_id}&select=id`,
    );
    if (remaining.ok && ((await remaining.json()) as unknown[]).length === 0) {
      await admin(`/rest/v1/journeys?id=eq.${member.journey_id}`, {
        method: "DELETE",
        headers: { Prefer: "return=minimal" },
      });
    }
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
