/**
 * Real backend API, backed by Supabase.
 *
 * Mirrors the function names/shapes of src/mock/api.ts so the UI (routes,
 * hooks) doesn't need to know which implementation it's talking to — see
 * src/data/index.ts for the mock/real switch.
 */
import { supabase } from "@/integrations/supabase/client";
import type { AvoidedExpense, Journey, DailyHabit, Member } from "@/lib/challenge";
import { todayISO } from "@/lib/challenge";
import type { Cadence, Goal, GoalTemplate, Log, Media, Metric } from "@/lib/goals";
import { parseTemplateGoals } from "@/lib/goals";
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
  goals: Goal[];
  logs: Log[];
}

export async function getChallengeData(journeyId: string): Promise<RealChallengeData> {
  const [journeyRes, membersRes, habitsRes, expensesRes, reviewsRes, goalsRes, logsRes] = await Promise.all([
    supabase.from("journeys").select("*").eq("id", journeyId).single(),
    supabase.from("members").select("*").eq("journey_id", journeyId),
    supabase.from("daily_habits").select("*").eq("journey_id", journeyId).order("date", { ascending: true }),
    supabase
      .from("avoided_expenses")
      .select("*")
      .eq("journey_id", journeyId)
      .order("date", { ascending: false }),
    supabase.from("weekly_reviews").select("*").eq("journey_id", journeyId),
    supabase.from("goals").select("*").eq("journey_id", journeyId).order("sort_order", { ascending: true }),
    supabase.from("logs").select("*").eq("journey_id", journeyId).order("date", { ascending: true }),
  ]);

  const error =
    journeyRes.error ||
    membersRes.error ||
    habitsRes.error ||
    expensesRes.error ||
    reviewsRes.error ||
    goalsRes.error ||
    logsRes.error;
  if (error) throw new Error(error.message);

  return {
    journey: journeyRes.data as Journey,
    members: (membersRes.data ?? []) as Member[],
    habits: (habitsRes.data ?? []) as DailyHabit[],
    expenses: (expensesRes.data ?? []) as AvoidedExpense[],
    reviews: reviewsRes.data ?? [],
    goals: (goalsRes.data ?? []) as Goal[],
    logs: (logsRes.data ?? []) as Log[],
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
  /** 'goal' | 'daily' | 'weekly'. */
  type: string;
  /** Required for a 'goal' reminder, and must be null for the others. */
  goalId?: string | null;
  enabled: boolean;
  time: string;
}): Promise<void> {
  const goalId = input.goalId ?? null;
  // Two partial unique indexes cover this table, so the conflict target
  // depends on the kind of reminder: per-goal rows key on goal_id, and the
  // journey-level ones on reminder_type.
  const onConflict = goalId ? "member_id,goal_id" : "member_id,reminder_type";

  const { error } = await supabase.from("reminders").upsert(
    {
      member_id: input.memberId,
      reminder_type: input.type,
      goal_id: goalId,
      enabled: input.enabled,
      reminder_time: input.time,
    },
    { onConflict },
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

/* ---------- goals & logs (P2) ---------- */

export async function listGoals(journeyId: string): Promise<Goal[]> {
  const { data, error } = await supabase
    .from("goals")
    .select("*")
    .eq("journey_id", journeyId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Goal[];
}

export async function listLogs(journeyId: string): Promise<Log[]> {
  const { data, error } = await supabase
    .from("logs")
    .select("*")
    .eq("journey_id", journeyId)
    .order("date", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Log[];
}

export async function listGoalTemplates(): Promise<GoalTemplate[]> {
  const { data, error } = await supabase
    .from("goal_templates")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  // `goals` is arbitrary jsonb in the database, so it is validated rather
  // than cast — see parseTemplateGoals.
  return (data ?? []).map((row) => ({
    ...row,
    goals: parseTemplateGoals(row.goals),
  })) as GoalTemplate[];
}

export async function createGoal(input: {
  journeyId: string;
  ownerMemberId: string | null;
  title: string;
  category: string;
  icon?: string | null;
  cadence?: Cadence;
  metric?: Metric;
  unit?: string | null;
  targetPerPeriod?: number | null;
  targetTotal?: number | null;
  /**
   * Defaults to today, never to the journey's start date. A goal added on day
   * 40 must not report 39 retroactive misses.
   */
  startsOn?: string;
  sortOrder?: number;
}): Promise<Goal> {
  const { data, error } = await supabase
    .from("goals")
    .insert({
      journey_id: input.journeyId,
      owner_member_id: input.ownerMemberId,
      title: input.title,
      category: input.category,
      icon: input.icon ?? null,
      cadence: input.cadence ?? "daily",
      metric: input.metric ?? "bool",
      unit: input.unit ?? null,
      target_per_period: input.targetPerPeriod ?? null,
      target_total: input.targetTotal ?? null,
      starts_on: input.startsOn ?? todayISO(),
      sort_order: input.sortOrder ?? 0,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Goal;
}

export async function updateGoal(goalId: string, patch: Partial<Goal>): Promise<void> {
  const { error } = await supabase.from("goals").update(patch).eq("id", goalId);
  if (error) throw new Error(error.message);
}

/**
 * Archive rather than delete. A goal someone kept for 60 days is part of their
 * story, and deleting it would take its logs with it via ON DELETE CASCADE.
 */
export async function archiveGoal(goalId: string): Promise<void> {
  const { error } = await supabase
    .from("goals")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", goalId);
  if (error) throw new Error(error.message);

  // Turn off any reminder for it. reminders_due already refuses to fire on an
  // archived goal, so leaving the row enabled would be a silent lie: Settings
  // hides archived goals, so the toggle would sit switched on somewhere the
  // user cannot see or reach. Disabled rather than deleted, so un-archiving
  // later brings the configured time back.
  const { error: remError } = await supabase
    .from("reminders")
    .update({ enabled: false })
    .eq("goal_id", goalId);
  if (remError) throw new Error(remError.message);
}

/**
 * Apply a template's goals to a journey.
 *
 * starts_on is today for every goal, so adding a template mid-journey does not
 * backdate misses.
 */
export async function applyGoalTemplate(input: {
  journeyId: string;
  ownerMemberId: string | null;
  template: GoalTemplate;
  startsOn?: string;
}): Promise<{ added: number; skipped: number }> {
  const startsOn = input.startsOn ?? todayISO();

  // Skip goals the journey already has under the same name.
  //
  // Without this, adding a template you already hold silently duplicates every
  // goal in it — which is exactly what happened in production when the
  // original-four template was added on top of the four the P2 backfill had
  // already created. The migration's own backfill guarded against this; this
  // path did not.
  const { data: existing, error: readError } = await supabase
    .from("goals")
    .select("title")
    .eq("journey_id", input.journeyId)
    .is("archived_at", null);
  if (readError) throw new Error(readError.message);

  const held = new Set((existing ?? []).map((g) => g.title.trim().toLowerCase()));
  const fresh = input.template.goals.filter((g) => !held.has(g.title.trim().toLowerCase()));

  if (fresh.length === 0) return { added: 0, skipped: input.template.goals.length };

  const rows = fresh.map((g, i) => ({
    journey_id: input.journeyId,
    owner_member_id: input.ownerMemberId,
    title: g.title,
    category: g.category ?? input.template.category,
    icon: g.icon ?? null,
    cadence: g.cadence ?? "daily",
    metric: g.metric ?? "bool",
    unit: g.unit ?? null,
    target_per_period: g.target_per_period ?? null,
    target_total: g.target_total ?? null,
    starts_on: startsOn,
    sort_order: i + 1,
  }));
  const { error } = await supabase.from("goals").insert(rows);
  if (error) throw new Error(error.message);
  return { added: fresh.length, skipped: input.template.goals.length - fresh.length };
}

/**
 * Log a dated goal (daily or weekly) for one day.
 *
 * Upserts on the trigger-derived slot, which is what makes tapping a goal
 * twice idempotent instead of an error. `slot` and `journey_id` are omitted
 * deliberately — the database assigns both, and a client that could set them
 * could log under another journey or bypass the uniqueness key.
 */
export async function upsertGoalLog(input: {
  memberId: string;
  goalId: string;
  date: string;
  done?: boolean;
  amount?: number | null;
  note?: string | null;
}): Promise<void> {
  const { error } = await supabase.from("logs").upsert(
    {
      member_id: input.memberId,
      goal_id: input.goalId,
      date: input.date,
      done: input.done ?? true,
      amount: input.amount ?? null,
      note: input.note ?? null,
    },
    { onConflict: "member_id,goal_id,slot" },
  );
  if (error) throw new Error(error.message);
}

/** Remove a dated goal's log for a day — untapping it. */
export async function deleteGoalLog(input: {
  memberId: string;
  goalId: string;
  date: string;
}): Promise<void> {
  const { error } = await supabase
    .from("logs")
    .delete()
    .eq("member_id", input.memberId)
    .eq("goal_id", input.goalId)
    .eq("date", input.date);
  if (error) throw new Error(error.message);
}

/**
 * Add a log that is not an upsert: open goals and memories both allow many per
 * day, so these always insert.
 */
export async function addLog(input: {
  memberId: string;
  goalId: string | null;
  date: string;
  amount?: number | null;
  note?: string | null;
  place?: string | null;
}): Promise<Log> {
  const { data, error } = await supabase
    .from("logs")
    .insert({
      member_id: input.memberId,
      goal_id: input.goalId,
      date: input.date,
      done: true,
      amount: input.amount ?? null,
      note: input.note ?? null,
      place: input.place ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Log;
}

export async function deleteLog(logId: string): Promise<void> {
  const { error } = await supabase.from("logs").delete().eq("id", logId);
  if (error) throw new Error(error.message);
}

/* ---------- memories & media (P6) ---------- */

const MEMORIES_BUCKET = "memories";

/** Signed URLs expire; an hour outlives any page view without lingering. */
const SIGNED_URL_TTL_SECONDS = 3600;

export async function listMedia(journeyId: string): Promise<Media[]> {
  // RLS scopes media through its log, so filtering by journey means joining.
  const { data, error } = await supabase
    .from("media")
    .select("*, logs!inner(journey_id)")
    .eq("logs.journey_id", journeyId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(({ logs: _logs, ...m }) => m) as Media[];
}

/**
 * Short-lived URLs for a batch of storage paths.
 *
 * The bucket is private, so there is no stable URL to cache — every render
 * asks for fresh ones. Paths that fail resolve to null rather than throwing,
 * because one missing object should not blank the whole feed.
 */
export async function signedUrlsFor(paths: string[]): Promise<Record<string, string | null>> {
  if (paths.length === 0) return {};
  const { data, error } = await supabase.storage
    .from(MEMORIES_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  if (error) throw new Error(error.message);
  const out: Record<string, string | null> = {};
  for (const row of data ?? []) {
    if (row.path) out[row.path] = row.signedUrl ?? null;
  }
  return out;
}

/**
 * Attach a photo to a log.
 *
 * The path is `{journey_id}/{log_id}/{random}.{ext}`. The leading journey id is
 * not decoration: storage RLS decides access from that first segment alone, so
 * a client cannot write outside its own journey however it names the rest.
 */
export async function uploadMemoryPhoto(input: {
  journeyId: string;
  logId: string;
  file: File;
}): Promise<Media> {
  const ext = (input.file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${input.journeyId}/${input.logId}/${crypto.randomUUID()}.${ext || "jpg"}`;

  const { error: upErr } = await supabase.storage
    .from(MEMORIES_BUCKET)
    .upload(path, input.file, { contentType: input.file.type, upsert: false });
  if (upErr) throw new Error(upErr.message);

  const { data, error } = await supabase
    .from("media")
    .insert({
      log_id: input.logId,
      storage_path: path,
      mime: input.file.type || null,
      bytes: input.file.size,
    })
    .select()
    .single();

  if (error) {
    // The row is what makes the object findable. Without it the upload is an
    // orphan nobody can reach or delete, so undo it rather than leave litter.
    await supabase.storage.from(MEMORIES_BUCKET).remove([path]);
    throw new Error(error.message);
  }
  return data as Media;
}

export async function deleteMedia(media: Media): Promise<void> {
  // Object first: if this fails the row stays and the delete can be retried.
  // The other order would leave an unreachable object behind.
  const { error: rmErr } = await supabase.storage
    .from(MEMORIES_BUCKET)
    .remove([media.storage_path]);
  if (rmErr) throw new Error(rmErr.message);

  const { error } = await supabase.from("media").delete().eq("id", media.id);
  if (error) throw new Error(error.message);
}

/* ---------- social feed (P7) ---------- */

export interface Post {
  id: string;
  author_member_id: string;
  journey_id: string;
  log_id: string | null;
  body: string;
  visibility: 'public';
  created_at: string;
  author_name: string;
  author_avatar: string | null;
}

export interface Follow {
  follower_member_id: string;
  following_member_id: string;
  created_at: string;
}

export interface DiscoverRow {
  member_id: string;
  name: string;
  avatar: string | null;
  last_posted_at: string;
}

export async function createPost(input: {
  authorMemberId: string;
  journeyId: string;
  logId: string | null;
  body: string;
}): Promise<Post> {
  // cast to any: posts/follows tables added via migration, types.ts not yet regenerated
  const db = supabase as any;
  const { data, error } = await db
    .from('posts')
    .insert({
      author_member_id: input.authorMemberId,
      journey_id: input.journeyId,
      log_id: input.logId,
      body: input.body,
    })
    .select('*, members!author_member_id(name, avatar)')
    .single();
  if (error) throw new Error(error.message);
  return {
    ...data,
    author_name: data.members?.name ?? '',
    author_avatar: data.members?.avatar ?? null,
  } as Post;
}

export async function deletePost(postId: string): Promise<void> {
  const db = supabase as any;
  const { error } = await db.from('posts').delete().eq('id', postId);
  if (error) throw new Error(error.message);
}

export async function listFeedPosts(input: {
  memberId: string;
  limit: number;
  cursor?: string;
}): Promise<Post[]> {
  const db = supabase as any;
  const { data: followRows } = await db
    .from('follows')
    .select('following_member_id')
    .eq('follower_member_id', input.memberId);

  const followedIds = (followRows ?? []).map((r: any) => r.following_member_id);
  const authorIds = [...followedIds, input.memberId];

  let query = db
    .from('posts')
    .select('*, members!author_member_id(name, avatar)')
    .in('author_member_id', authorIds)
    .order('created_at', { ascending: false })
    .limit(input.limit);

  if (input.cursor) {
    query = query.lt('created_at', input.cursor);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: any) => ({
    ...row,
    author_name: row.members?.name ?? '',
    author_avatar: row.members?.avatar ?? null,
  })) as Post[];
}

export async function listUserPosts(input: {
  memberId: string;
  limit?: number;
}): Promise<Post[]> {
  const db = supabase as any;
  const { data, error } = await db
    .from('posts')
    .select('*, members!author_member_id(name, avatar)')
    .eq('author_member_id', input.memberId)
    .order('created_at', { ascending: false })
    .limit(input.limit ?? 20);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: any) => ({
    ...row,
    author_name: row.members?.name ?? '',
    author_avatar: row.members?.avatar ?? null,
  })) as Post[];
}

export async function followMember(input: {
  followerMemberId: string;
  followingMemberId: string;
}): Promise<void> {
  const db = supabase as any;
  const { error } = await db.from('follows').insert({
    follower_member_id: input.followerMemberId,
    following_member_id: input.followingMemberId,
  });
  if (error) throw new Error(error.message);
}

export async function unfollowMember(input: {
  followerMemberId: string;
  followingMemberId: string;
}): Promise<void> {
  const db = supabase as any;
  const { error } = await db
    .from('follows')
    .delete()
    .eq('follower_member_id', input.followerMemberId)
    .eq('following_member_id', input.followingMemberId);
  if (error) throw new Error(error.message);
}

export async function listFollowing(memberId: string): Promise<Follow[]> {
  const db = supabase as any;
  const { data, error } = await db
    .from('follows')
    .select('*')
    .eq('follower_member_id', memberId);
  if (error) throw new Error(error.message);
  return (data ?? []) as Follow[];
}

export async function listFollowers(memberId: string): Promise<Follow[]> {
  const db = supabase as any;
  const { data, error } = await db
    .from('follows')
    .select('*')
    .eq('following_member_id', memberId);
  if (error) throw new Error(error.message);
  return (data ?? []) as Follow[];
}

export async function discoverMembers(input: {
  memberId: string;
  limit: number;
}): Promise<DiscoverRow[]> {
  const { data, error } = await supabase.rpc('discover_members' as any, {
    _member_id: input.memberId,
    _limit: input.limit,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as DiscoverRow[];
}
