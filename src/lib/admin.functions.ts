import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface AdminUserRow {
  authUserId: string;
  email: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  emailConfirmed: boolean;
  isAdmin: boolean;
  profileId: string | null;
  name: string | null;
  relationship: string | null;
  coupleId: string | null;
  coupleName: string | null;
}

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin access required");
}

/** Whether the signed-in user is an admin, plus whether any admin exists yet. */
export const getAdminStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any)
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    if (error) throw new Error(error.message);
    const admins = (data ?? []) as { user_id: string }[];
    return {
      isAdmin: admins.some((a) => a.user_id === context.userId),
      adminCount: admins.length,
    };
  });

/** First signed-in user may claim admin while no admin exists (bootstrap). */
export const claimFirstAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count, error: countErr } = await (supabaseAdmin as any)
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");
    if (countErr) throw new Error(countErr.message);
    if ((count ?? 0) > 0) throw new Error("An admin already exists. Ask them to grant you access.");
    const { error } = await (supabaseAdmin as any)
      .from("user_roles")
      .insert({ user_id: context.userId, role: "admin" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminUserRow[]> => {
    await assertAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (authErr) throw new Error(authErr.message);

    const [{ data: profiles, error: pErr }, { data: couples, error: cErr }, { data: roles, error: rErr }] =
      await Promise.all([
        supabaseAdmin.from("profiles").select("id, auth_user_id, name, relationship, couple_id"),
        supabaseAdmin.from("couples").select("id, name"),
        (supabaseAdmin as any).from("user_roles").select("user_id, role"),
      ]);
    if (pErr || cErr || rErr) throw new Error((pErr ?? cErr ?? rErr)!.message);

    const coupleName = new Map((couples ?? []).map((c) => [c.id, c.name]));
    const profileByAuth = new Map((profiles ?? []).filter((p) => p.auth_user_id).map((p) => [p.auth_user_id!, p]));
    const adminIds = new Set(
      ((roles ?? []) as { user_id: string; role: string }[]).filter((r) => r.role === "admin").map((r) => r.user_id),
    );

    return authData.users.map((u) => {
      const p = profileByAuth.get(u.id);
      return {
        authUserId: u.id,
        email: u.email ?? null,
        createdAt: u.created_at,
        lastSignInAt: u.last_sign_in_at ?? null,
        emailConfirmed: Boolean(u.email_confirmed_at),
        isAdmin: adminIds.has(u.id),
        profileId: p?.id ?? null,
        name: p?.name ?? null,
        relationship: p?.relationship ?? null,
        coupleId: p?.couple_id ?? null,
        coupleName: p?.couple_id ? (coupleName.get(p.couple_id) ?? null) : null,
      };
    });
  });

export const setUserAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; makeAdmin: boolean }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    if (data.userId === context.userId && !data.makeAdmin) {
      throw new Error("You cannot remove your own admin access.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.makeAdmin) {
      const { error } = await (supabaseAdmin as any)
        .from("user_roles")
        .upsert({ user_id: data.userId, role: "admin" }, { onConflict: "user_id,role" });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await (supabaseAdmin as any)
        .from("user_roles")
        .delete()
        .eq("user_id", data.userId)
        .eq("role", "admin");
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const updateUserProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { profileId: string; name: string; relationship: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ name: data.name.trim(), relationship: data.relationship.trim() })
      .eq("id", data.profileId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    if (data.userId === context.userId) throw new Error("You cannot delete your own account here.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Detach the profile so couple history survives, then remove the login.
    await supabaseAdmin.from("profiles").update({ auth_user_id: null }).eq("auth_user_id", data.userId);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendPasswordReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { email: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(data.email);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
