/**
 * Real backend API, backed by Supabase.
 *
 * Mirrors the function names/shapes of src/mock/api.ts so the UI (routes,
 * hooks) doesn't need to know which implementation it's talking to — see
 * src/data/index.ts for the mock/real switch.
 */
import { supabase } from "@/integrations/supabase/client";
import type { AvoidedExpense, Couple, DailyHabit, Profile } from "@/lib/challenge";

/**
 * Admin operations run as TanStack server functions, which only exist when a
 * server is serving them. Import them lazily so their client stubs stay out of
 * every page's module graph — a static import here would pull server-function
 * plumbing into a future static mobile bundle.
 */
function adminFns() {
  return import("@/lib/admin.functions");
}

/* ------------------------------- auth ---------------------------------- */

type AuthListener = (userId: string | null) => void;

export const auth = {
  onChange(listener: AuthListener): () => void {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      listener(session?.user?.id ?? null);
    });
    return () => data.subscription.unsubscribe();
  },
  async getSession(): Promise<{ userId: string | null }> {
    const { data } = await supabase.auth.getSession();
    return { userId: data.session?.user?.id ?? null };
  },
  async signIn(email: string, password: string): Promise<string> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.user.id;
  },
  async signUp(email: string, password: string): Promise<string> {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) throw error;
    return data.user!.id;
  },
  async signOut(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },
  /** Emails a recovery link that lands on /reset-password. */
  async requestPasswordReset(email: string): Promise<void> {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw error;
  },
  /** Sets a new password for the session created by a recovery link. */
  async updatePassword(password: string): Promise<void> {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  },
};

/* ------------------------------ profiles -------------------------------- */

export async function getMyProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from("profiles").select("*").eq("auth_user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  return data as Profile | null;
}

export async function createCouple(input: {
  userId: string;
  name: string;
  coupleName: string;
  relationship: string;
}): Promise<Couple> {
  const { data, error } = await supabase.rpc("create_couple_with_profile", {
    _couple_name: input.coupleName,
    _profile_name: input.name,
    _relationship: input.relationship,
  });
  if (error) throw new Error(error.message);
  return data as Couple;
}

export async function joinCouple(input: {
  userId: string;
  name: string;
  relationship: string;
  inviteCode: string;
}): Promise<void> {
  const { error } = await supabase.rpc("join_couple_by_code", {
    _invite_code: input.inviteCode,
    _name: input.name,
    _relationship: input.relationship,
  });
  if (error) throw new Error(error.message);
}

export async function updateProfileName(profileId: string, name: string): Promise<void> {
  const { error } = await supabase.from("profiles").update({ name: name.trim() }).eq("id", profileId);
  if (error) throw new Error(error.message);
}

export async function updateCouple(coupleId: string, patch: { name: string; start_date: string }): Promise<void> {
  const { error } = await supabase.from("couples").update(patch).eq("id", coupleId);
  if (error) throw new Error(error.message);
}

/* ---------------------------- challenge data ---------------------------- */

export interface RealChallengeData {
  couple: Couple;
  profiles: Profile[];
  habits: DailyHabit[];
  expenses: AvoidedExpense[];
  reviews: { id: string; profile_id: string; week_number: number; what_went_well: string | null; what_to_improve: string | null }[];
}

export async function getChallengeData(coupleId: string): Promise<RealChallengeData> {
  const [coupleRes, profilesRes, habitsRes, expensesRes, reviewsRes] = await Promise.all([
    supabase.from("couples").select("*").eq("id", coupleId).single(),
    supabase.from("profiles").select("*").eq("couple_id", coupleId),
    supabase.from("daily_habits").select("*").eq("couple_id", coupleId).order("date", { ascending: true }),
    supabase
      .from("avoided_expenses")
      .select("*")
      .eq("couple_id", coupleId)
      .order("date", { ascending: false }),
    supabase.from("weekly_reviews").select("*").eq("couple_id", coupleId),
  ]);

  const error = coupleRes.error || profilesRes.error || habitsRes.error || expensesRes.error || reviewsRes.error;
  if (error) throw new Error(error.message);

  return {
    couple: coupleRes.data as Couple,
    profiles: (profilesRes.data ?? []) as Profile[],
    habits: (habitsRes.data ?? []) as DailyHabit[],
    expenses: (expensesRes.data ?? []) as AvoidedExpense[],
    reviews: reviewsRes.data ?? [],
  };
}

export async function upsertHabit(input: {
  coupleId: string;
  profileId: string;
  date: string;
  patch: Partial<DailyHabit>;
}): Promise<void> {
  const { error } = await supabase.from("daily_habits").upsert(
    {
      couple_id: input.coupleId,
      profile_id: input.profileId,
      date: input.date,
      ...input.patch,
    },
    { onConflict: "profile_id,date" },
  );
  if (error) throw new Error(error.message);
}

/* ------------------------------ expenses -------------------------------- */

export async function addExpense(input: {
  coupleId: string;
  profileId: string;
  amount: number;
  description: string | null;
  reason: string | null;
  date: string;
}): Promise<void> {
  const { error } = await supabase.from("avoided_expenses").insert({
    couple_id: input.coupleId,
    profile_id: input.profileId,
    amount: input.amount,
    description: input.description,
    reason: input.reason,
    date: input.date,
  });
  if (error) throw new Error(error.message);
}

export async function deleteExpense(id: string): Promise<void> {
  const { error } = await supabase.from("avoided_expenses").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/* ------------------------------- reviews -------------------------------- */

export async function upsertReview(input: {
  coupleId: string;
  profileId: string;
  weekNumber: number;
  whatWentWell: string | null;
  whatToImprove: string | null;
}): Promise<void> {
  const { error } = await supabase.from("weekly_reviews").upsert(
    {
      couple_id: input.coupleId,
      profile_id: input.profileId,
      week_number: input.weekNumber,
      what_went_well: input.whatWentWell,
      what_to_improve: input.whatToImprove,
    },
    { onConflict: "profile_id,week_number" },
  );
  if (error) throw new Error(error.message);
}

/* ------------------------------ reminders ------------------------------- */

export async function listReminders(profileId: string) {
  const { data, error } = await supabase.from("reminders").select("*").eq("profile_id", profileId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function upsertReminder(input: {
  profileId: string;
  type: string;
  enabled: boolean;
  time: string;
}): Promise<void> {
  const { error } = await supabase.from("reminders").upsert(
    {
      profile_id: input.profileId,
      reminder_type: input.type,
      enabled: input.enabled,
      reminder_time: input.time,
    },
    { onConflict: "profile_id,reminder_type" },
  );
  if (error) throw new Error(error.message);
}

/* -------------------------------- admin --------------------------------- */
/* These delegate to server functions (src/lib/admin.functions.ts) which use
 * the service-role key and must run server-side. The `userId` params below
 * are accepted for signature parity with the mock layer but ignored — the
 * server derives the caller's identity from the auth bearer token. */

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

export async function getAdminStatus(_userId: string): Promise<{ isAdmin: boolean; adminCount: number }> {
  return (await adminFns()).getAdminStatus();
}

export async function claimFirstAdmin(_userId: string): Promise<void> {
  await (await adminFns()).claimFirstAdmin();
}

export async function listUsers(): Promise<AdminUserRow[]> {
  return (await adminFns()).listUsers();
}

export async function setUserAdmin(userId: string, makeAdmin: boolean): Promise<void> {
  await (await adminFns()).setUserAdmin({ data: { userId, makeAdmin } });
}

export async function adminUpdateProfile(profileId: string, name: string, relationship: string): Promise<void> {
  await (await adminFns()).updateUserProfile({ data: { profileId, name, relationship } });
}

export async function deleteUser(userId: string): Promise<void> {
  await (await adminFns()).deleteUser({ data: { userId } });
}

export async function sendPasswordReset(email: string): Promise<void> {
  await (await adminFns()).sendPasswordReset({ data: { email } });
}
