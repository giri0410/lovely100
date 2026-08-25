/**
 * Real backend API, backed by Supabase.
 *
 * Mirrors the function names/shapes of src/mock/api.ts so the UI (routes,
 * hooks) doesn't need to know which implementation it's talking to — see
 * src/data/index.ts for the mock/real switch.
 */
import { supabase } from "@/integrations/supabase/client";
import type { AvoidedExpense, Journey, DailyHabit, Member } from "@/lib/challenge";
import type { JourneyKind } from "@/lib/copy";

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
  /**
   * Permanently deletes the signed-in account and its challenge history.
   *
   * Runs in an Edge Function because removing an auth user needs the
   * service-role key, and because a packaged mobile app has no server of its
   * own to call. The function derives the account from the access token, so
   * there is no way to aim it at anyone else.
   */
  async deleteAccount(): Promise<void> {
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    const token = data.session?.access_token;
    if (!token) throw new Error("You need to be signed in to delete your account.");

    const { error } = await supabase.functions.invoke("delete-account", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (error) throw new Error("We couldn't delete your account. Please try again.");

    await supabase.auth.signOut();
  },
};

/* ------------------------------ members -------------------------------- */

export async function getMyMember(userId: string): Promise<Member | null> {
  const { data, error } = await supabase.from("members").select("*").eq("auth_user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  return data as Member | null;
}

export async function createJourney(input: {
  userId: string;
  name: string;
  journeyName: string;
  relationship: string;
  kind: JourneyKind;
}): Promise<Journey> {
  const { data, error } = await supabase.rpc("create_journey_with_member", {
    _journey_name: input.journeyName,
    _member_name: input.name,
    _relationship: input.relationship,
    _kind: input.kind,
  });
  if (error) throw new Error(error.message);
  return data as Journey;
}

export async function joinJourney(input: {
  userId: string;
  name: string;
  relationship: string;
  inviteCode: string;
}): Promise<void> {
  const { error } = await supabase.rpc("join_journey_by_code", {
    _invite_code: input.inviteCode,
    _name: input.name,
    _relationship: input.relationship,
  });
  if (error) throw new Error(error.message);
}

export async function updateMemberName(memberId: string, name: string): Promise<void> {
  const { error } = await supabase.from("members").update({ name: name.trim() }).eq("id", memberId);
  if (error) throw new Error(error.message);
}

export async function updateJourney(journeyId: string, patch: { name: string; start_date: string }): Promise<void> {
  const { error } = await supabase.from("journeys").update(patch).eq("id", journeyId);
  if (error) throw new Error(error.message);
}

/* ---------------------------- challenge data ---------------------------- */

export interface RealChallengeData {
  journey: Journey;
  members: Member[];
  habits: DailyHabit[];
  expenses: AvoidedExpense[];
  reviews: { id: string; member_id: string; week_number: number; what_went_well: string | null; what_to_improve: string | null }[];
}

export async function getChallengeData(journeyId: string): Promise<RealChallengeData> {
  const [journeyRes, membersRes, habitsRes, expensesRes, reviewsRes] = await Promise.all([
    supabase.from("journeys").select("*").eq("id", journeyId).single(),
    supabase.from("members").select("*").eq("journey_id", journeyId),
    supabase.from("daily_habits").select("*").eq("journey_id", journeyId).order("date", { ascending: true }),
    supabase
      .from("avoided_expenses")
      .select("*")
      .eq("journey_id", journeyId)
      .order("date", { ascending: false }),
    supabase.from("weekly_reviews").select("*").eq("journey_id", journeyId),
  ]);

  const error = journeyRes.error || membersRes.error || habitsRes.error || expensesRes.error || reviewsRes.error;
  if (error) throw new Error(error.message);

  return {
    journey: journeyRes.data as Journey,
    members: (membersRes.data ?? []) as Member[],
    habits: (habitsRes.data ?? []) as DailyHabit[],
    expenses: (expensesRes.data ?? []) as AvoidedExpense[],
    reviews: reviewsRes.data ?? [],
  };
}

export async function upsertHabit(input: {
  journeyId: string;
  memberId: string;
  date: string;
  patch: Partial<DailyHabit>;
}): Promise<void> {
  const { error } = await supabase.from("daily_habits").upsert(
    {
      journey_id: input.journeyId,
      member_id: input.memberId,
      date: input.date,
      ...input.patch,
    },
    { onConflict: "member_id,date" },
  );
  if (error) throw new Error(error.message);
}

/* ------------------------------ expenses -------------------------------- */

export async function addExpense(input: {
  journeyId: string;
  memberId: string;
  amount: number;
  description: string | null;
  reason: string | null;
  date: string;
}): Promise<void> {
  const { error } = await supabase.from("avoided_expenses").insert({
    journey_id: input.journeyId,
    member_id: input.memberId,
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
  journeyId: string;
  memberId: string;
  weekNumber: number;
  whatWentWell: string | null;
  whatToImprove: string | null;
}): Promise<void> {
  const { error } = await supabase.from("weekly_reviews").upsert(
    {
      journey_id: input.journeyId,
      member_id: input.memberId,
      week_number: input.weekNumber,
      what_went_well: input.whatWentWell,
      what_to_improve: input.whatToImprove,
    },
    { onConflict: "member_id,week_number" },
  );
  if (error) throw new Error(error.message);
}

/* ------------------------------ reminders ------------------------------- */

export async function listReminders(memberId: string) {
  const { data, error } = await supabase.from("reminders").select("*").eq("member_id", memberId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function upsertReminder(input: {
  memberId: string;
  type: string;
  enabled: boolean;
  time: string;
}): Promise<void> {
  const { error } = await supabase.from("reminders").upsert(
    {
      member_id: input.memberId,
      reminder_type: input.type,
      enabled: input.enabled,
      reminder_time: input.time,
    },
    { onConflict: "member_id,reminder_type" },
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
  memberId: string | null;
  name: string | null;
  relationship: string | null;
  journeyId: string | null;
  journeyName: string | null;
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

export async function adminUpdateMember(memberId: string, name: string, relationship: string): Promise<void> {
  await (await adminFns()).updateUserMember({ data: { memberId, name, relationship } });
}

export async function deleteUser(userId: string): Promise<void> {
  await (await adminFns()).deleteUser({ data: { userId } });
}

export async function sendPasswordReset(email: string): Promise<void> {
  await (await adminFns()).sendPasswordReset({ data: { email } });
}
