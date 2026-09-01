/**
 * Mock backend API.
 *
 * This is the ONLY module the UI talks to for data. Every function is async and
 * mimics a network round-trip, so swapping in a real backend later means
 * re-implementing these functions without touching any component.
 *
 * State lives in memory and is mirrored to localStorage so a page refresh keeps
 * whatever the user did during the session.
 */
import type { AvoidedExpense, Journey, DailyHabit, Member } from "@/lib/challenge";
import { todayISO } from "@/lib/challenge";
import type { Cadence, Goal, GoalTemplate, Log, Media, Metric } from "@/lib/goals";
import type { JourneyKind } from "@/lib/copy";
import {
  createSeedDatabase,
  uid,
  type MockDatabase,
  type MockReminder,
  type MockUser,
  type MockWeeklyReview,
} from "./seed";

const STORAGE_KEY = "100days.mock.db.v1";
const LATENCY = 220;

let db: MockDatabase = createSeedDatabase();
let hydrated = false;

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) db = JSON.parse(raw) as MockDatabase;
  } catch {
    /* fall back to the seed */
  }
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    /* ignore quota errors */
  }
}

function delay<T>(value: T): Promise<T> {
  hydrate();
  return new Promise((resolve) => setTimeout(() => resolve(value), LATENCY));
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Wipe local changes and go back to the shipped demo data. */
export function resetMockDatabase() {
  db = createSeedDatabase();
  hydrated = true;
  persist();
  authListeners.forEach((l) => l(null));
}

/* ------------------------------- auth ---------------------------------- */

type AuthListener = (userId: string | null) => void;
const authListeners = new Set<AuthListener>();

function emitAuth() {
  authListeners.forEach((l) => l(db.sessionUserId));
}

export const mockAuth = {
  onChange(listener: AuthListener): () => void {
    authListeners.add(listener);
    return () => authListeners.delete(listener);
  },
  async getSession(): Promise<{ userId: string | null }> {
    hydrate();
    return delay({ userId: db.sessionUserId });
  },
  async signIn(email: string, password: string): Promise<string> {
    hydrate();
    await delay(null);
    const user = db.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    if (!user || user.password !== password) throw new Error("Invalid email or password.");
    db.sessionUserId = user.id;
    user.last_sign_in_at = new Date().toISOString();
    persist();
    emitAuth();
    return user.id;
  },
  async signUp(email: string, password: string): Promise<string> {
    hydrate();
    await delay(null);
    if (db.users.some((u) => u.email.toLowerCase() === email.trim().toLowerCase())) {
      throw new Error("An account with that email already exists.");
    }
    const user: MockUser = {
      id: uid("user"),
      email: email.trim(),
      password,
      created_at: new Date().toISOString(),
      last_sign_in_at: new Date().toISOString(),
      email_confirmed: true,
      is_admin: db.users.length === 0,
    };
    db.users.push(user);
    db.sessionUserId = user.id;
    persist();
    emitAuth();
    return user.id;
  },
  async signOut(): Promise<void> {
    hydrate();
    await delay(null);
    db.sessionUserId = null;
    persist();
    emitAuth();
  },
  async requestPasswordReset(_email: string): Promise<void> {
    hydrate();
    await delay(null);
  },
  async updatePassword(password: string): Promise<void> {
    hydrate();
    await delay(null);
    const user = db.users.find((u) => u.id === db.sessionUserId);
    if (user) user.password = password;
    persist();
  },
  async deleteAccount(): Promise<void> {
    hydrate();
    await delay(null);
    const userId = db.sessionUserId;
    if (!userId) throw new Error("You need to be signed in to delete your account.");
    const memberIds = db.members.filter((p) => p.auth_user_id === userId).map((p) => p.id);
    db.habits = db.habits.filter((h) => !memberIds.includes(h.member_id));
    db.expenses = db.expenses.filter((e) => !memberIds.includes(e.member_id));
    db.reviews = db.reviews.filter((r) => !memberIds.includes(r.member_id));
    db.reminders = db.reminders.filter((r) => !memberIds.includes(r.member_id));
    db.members = db.members.filter((p) => p.auth_user_id !== userId);
    db.users = db.users.filter((u) => u.id !== userId);
    db.sessionUserId = null;
    persist();
    emitAuth();
  },
};

/* ------------------------------ members -------------------------------- */

export async function getMyMember(userId: string): Promise<Member | null> {
  hydrate();
  return delay(clone(db.members.find((p) => p.auth_user_id === userId) ?? null));
}

export async function createJourney(input: {
  userId: string;
  name: string;
  journeyName: string;
  relationship: string;
  kind: JourneyKind;
}): Promise<Journey> {
  hydrate();
  await delay(null);
  const journey: Journey = {
    id: uid("journey"),
    name: input.journeyName || `${input.name}'s 100 days`,
    start_date: todayISO(),
    duration: 100,
    invite_code: uid("").slice(1, 7).toUpperCase(),
    is_demo: false,
    kind: input.kind,
  };
  db.journeys.push(journey);
  db.members.push({
    id: uid("member"),
    auth_user_id: input.userId,
    journey_id: journey.id,
    name: input.name,
    relationship: input.relationship.trim() || null,
    avatar: null,
  });
  persist();
  return clone(journey);
}

export async function joinJourney(input: {
  userId: string;
  name: string;
  relationship: string;
  inviteCode: string;
}): Promise<void> {
  hydrate();
  await delay(null);
  const journey = db.journeys.find((c) => c.invite_code === input.inviteCode.trim().toUpperCase());
  if (!journey) throw new Error("We couldn't find that invite code");
  // Joining makes a journey shared regardless of how it was created.
  journey.kind = "shared";
  db.members.push({
    id: uid("member"),
    auth_user_id: input.userId,
    journey_id: journey.id,
    name: input.name,
    relationship: input.relationship.trim() || null,
    avatar: null,
  });
  persist();
}

export async function updateMemberName(memberId: string, name: string): Promise<void> {
  hydrate();
  await delay(null);
  const member = db.members.find((p) => p.id === memberId);
  if (member) member.name = name.trim();
  persist();
}

export async function updateJourney(journeyId: string, patch: { name: string; start_date: string }): Promise<void> {
  hydrate();
  await delay(null);
  const journey = db.journeys.find((c) => c.id === journeyId);
  if (journey) Object.assign(journey, { name: patch.name, start_date: patch.start_date });
  persist();
}

/* ---------------------------- challenge data ---------------------------- */

export interface MockChallengeData {
  journey: Journey;
  members: Member[];
  habits: DailyHabit[];
  expenses: AvoidedExpense[];
  reviews: MockWeeklyReview[];
  goals: Goal[];
  logs: Log[];
}

export async function getChallengeData(journeyId: string): Promise<MockChallengeData> {
  hydrate();
  const journey = db.journeys.find((c) => c.id === journeyId);
  if (!journey) throw new Error("Challenge not found");
  const memberIds = db.members.filter((p) => p.journey_id === journeyId).map((p) => p.id);
  return delay(
    clone({
      journey,
      members: db.members.filter((p) => p.journey_id === journeyId),
      habits: db.habits.filter((h) => h.journey_id === journeyId).sort((a, b) => a.date.localeCompare(b.date)),
      expenses: db.expenses
        .filter((e) => memberIds.includes(e.member_id))
        .sort((a, b) => b.date.localeCompare(a.date)),
      reviews: db.reviews.filter((r) => r.journey_id === journeyId),
      goals: db.goals
        .filter((g) => g.journey_id === journeyId)
        .sort((a, b) => a.sort_order - b.sort_order),
      logs: db.logs.filter((l) => l.journey_id === journeyId).sort((a, b) => a.date.localeCompare(b.date)),
    }),
  );
}

export async function upsertHabit(input: {
  journeyId: string;
  memberId: string;
  date: string;
  patch: Partial<DailyHabit>;
}): Promise<void> {
  hydrate();
  await delay(null);
  const existing = db.habits.find((h) => h.member_id === input.memberId && h.date === input.date);
  if (existing) {
    Object.assign(existing, input.patch);
  } else {
    db.habits.push({
      id: uid("habit"),
      journey_id: input.journeyId,
      member_id: input.memberId,
      date: input.date,
      walk_completed: false,
      walk_duration: null,
      healthy_food_completed: false,
      unnecessary_spending_completed: false,
      certification_completed: false,
      certification_minutes: null,
      certification_topic: null,
      notes: null,
      ...input.patch,
    });
  }
  persist();
}

/* ------------------------------ expenses -------------------------------- */

export async function addExpense(input: {
  /** Unused in the mock layer — kept for signature parity with the real backend. */
  journeyId?: string;
  memberId: string;
  amount: number;
  description: string | null;
  reason: string | null;
  date: string;
}): Promise<void> {
  hydrate();
  await delay(null);
  db.expenses.push({
    id: uid("expense"),
    member_id: input.memberId,
    amount: input.amount,
    description: input.description,
    reason: input.reason,
    date: input.date,
  });
  persist();
}

export async function deleteExpense(id: string): Promise<void> {
  hydrate();
  await delay(null);
  db.expenses = db.expenses.filter((e) => e.id !== id);
  persist();
}

/* ------------------------------- reviews -------------------------------- */

export async function upsertReview(input: {
  journeyId: string;
  memberId: string;
  weekNumber: number;
  whatWentWell: string | null;
  whatToImprove: string | null;
}): Promise<void> {
  hydrate();
  await delay(null);
  const existing = db.reviews.find((r) => r.member_id === input.memberId && r.week_number === input.weekNumber);
  if (existing) {
    existing.what_went_well = input.whatWentWell;
    existing.what_to_improve = input.whatToImprove;
  } else {
    db.reviews.push({
      id: uid("review"),
      journey_id: input.journeyId,
      member_id: input.memberId,
      week_number: input.weekNumber,
      what_went_well: input.whatWentWell,
      what_to_improve: input.whatToImprove,
    });
  }
  persist();
}

/* ------------------------------ reminders ------------------------------- */

export async function listReminders(memberId: string): Promise<MockReminder[]> {
  hydrate();
  return delay(clone(db.reminders.filter((r) => r.member_id === memberId)));
}

export async function upsertReminder(input: {
  memberId: string;
  type: string;
  goalId?: string | null;
  enabled: boolean;
  time: string;
}): Promise<void> {
  hydrate();
  await delay(null);
  const goalId = input.goalId ?? null;
  // Mirrors the two partial unique indexes: a goal reminder is identified by
  // its goal, and a journey-level one by its type.
  const existing = db.reminders.find((r) =>
    r.member_id === input.memberId &&
    (goalId ? r.goal_id === goalId : r.goal_id == null && r.reminder_type === input.type),
  );
  if (existing) {
    existing.enabled = input.enabled;
    existing.reminder_time = input.time;
  } else {
    db.reminders.push({
      id: uid("rem"),
      member_id: input.memberId,
      reminder_type: input.type,
      goal_id: goalId,
      enabled: input.enabled,
      reminder_time: input.time,
    });
  }
  persist();
}

/* -------------------------------- admin --------------------------------- */

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

export async function getAdminStatus(userId: string): Promise<{ isAdmin: boolean; adminCount: number }> {
  hydrate();
  return delay({
    isAdmin: !!db.users.find((u) => u.id === userId)?.is_admin,
    adminCount: db.users.filter((u) => u.is_admin).length,
  });
}

export async function claimFirstAdmin(userId: string): Promise<void> {
  hydrate();
  await delay(null);
  if (db.users.some((u) => u.is_admin)) throw new Error("An admin already exists. Ask them to grant you access.");
  const user = db.users.find((u) => u.id === userId);
  if (!user) throw new Error("Account not found");
  user.is_admin = true;
  persist();
}

export async function listUsers(): Promise<AdminUserRow[]> {
  hydrate();
  return delay(
    db.users.map((u) => {
      const member = db.members.find((p) => p.auth_user_id === u.id) ?? null;
      const journey = member ? db.journeys.find((c) => c.id === member.journey_id) : undefined;
      return {
        authUserId: u.id,
        email: u.email,
        createdAt: u.created_at,
        lastSignInAt: u.last_sign_in_at,
        emailConfirmed: u.email_confirmed,
        isAdmin: u.is_admin,
        memberId: member?.id ?? null,
        name: member?.name ?? null,
        relationship: member?.relationship ?? null,
        journeyId: member?.journey_id ?? null,
        journeyName: journey?.name ?? null,
      };
    }),
  );
}

export async function setUserAdmin(userId: string, makeAdmin: boolean): Promise<void> {
  hydrate();
  await delay(null);
  const user = db.users.find((u) => u.id === userId);
  if (user) user.is_admin = makeAdmin;
  persist();
}

export async function adminUpdateMember(memberId: string, name: string, relationship: string): Promise<void> {
  hydrate();
  await delay(null);
  const member = db.members.find((p) => p.id === memberId);
  if (member) {
    member.name = name.trim();
    member.relationship = relationship.trim();
  }
  persist();
}

export async function deleteUser(userId: string): Promise<void> {
  hydrate();
  await delay(null);
  db.members.forEach((p) => {
    if (p.auth_user_id === userId) p.auth_user_id = null;
  });
  db.users = db.users.filter((u) => u.id !== userId);
  persist();
}

export async function sendPasswordReset(_email: string): Promise<void> {
  hydrate();
  await delay(null);
}

/**
 * Mirrors the goal_templates rows the P2 migration inserts. Kept in sync by
 * hand because mock mode has no database — if these drift, mock mode stops
 * being a faithful rehearsal of the real thing.
 */
const MOCK_TEMPLATES: GoalTemplate[] = [
  {
    id: "tpl-original-four",
    slug: "original-four",
    title: "Health & discipline",
    description: "The original Lovely 100 set: a walk, clean eating, no wasteful spending, and daily study.",
    category: "health",
    icon: "🌱",
    sort_order: 10,
    goals: [
      { title: "Morning Walk", icon: "🚶", category: "health", cadence: "daily", metric: "number", unit: "minutes", target_per_period: 30 },
      { title: "Healthy Food", icon: "🥗", category: "health", cadence: "daily", metric: "bool" },
      { title: "No Unnecessary Spending", icon: "💸", category: "money", cadence: "daily", metric: "bool" },
      { title: "Certification", icon: "📘", category: "learning", cadence: "daily", metric: "number", unit: "minutes", target_per_period: 30 },
    ],
  },
  {
    id: "tpl-cooking",
    slug: "cooking",
    title: "Cooking & food",
    description: "Cook more, order less, and work through the recipes you keep meaning to try.",
    category: "cooking",
    icon: "🍳",
    sort_order: 20,
    goals: [
      { title: "Cook at home", icon: "🍳", category: "cooking", cadence: "daily", metric: "bool" },
      { title: "Try a new recipe", icon: "📖", category: "cooking", cadence: "weekly", metric: "bool", target_per_period: 1 },
      { title: "Recipes to try", icon: "⭐", category: "cooking", cadence: "open", metric: "bool", target_total: 20 },
    ],
  },
  {
    id: "tpl-places",
    slug: "places",
    title: "Places & memories",
    description: "Trips, small outings, and the days worth keeping.",
    category: "travel",
    icon: "✈️",
    sort_order: 30,
    goals: [
      { title: "Places to visit", icon: "📍", category: "travel", cadence: "open", metric: "bool", target_total: 10 },
      { title: "Go somewhere new", icon: "🗺️", category: "travel", cadence: "weekly", metric: "bool", target_per_period: 1 },
      { title: "Photo of the day", icon: "📷", category: "memories", cadence: "daily", metric: "bool" },
    ],
  },
  {
    id: "tpl-movement",
    slug: "movement",
    title: "Sport & movement",
    description: "Whatever moving well looks like for you.",
    category: "health",
    icon: "🏃",
    sort_order: 40,
    goals: [
      { title: "Workout", icon: "🏋️", category: "health", cadence: "weekly", metric: "bool", target_per_period: 3 },
      { title: "Steps", icon: "👟", category: "health", cadence: "daily", metric: "number", unit: "steps", target_per_period: 8000 },
      { title: "Sleep by 11pm", icon: "😴", category: "health", cadence: "daily", metric: "bool" },
    ],
  },
  {
    id: "tpl-learning",
    slug: "learning",
    title: "Learning & money",
    description: "Study a little every day, and track what you chose not to spend.",
    category: "learning",
    icon: "📘",
    sort_order: 50,
    goals: [
      { title: "Study", icon: "📘", category: "learning", cadence: "daily", metric: "number", unit: "minutes", target_per_period: 30 },
      { title: "Read", icon: "📚", category: "learning", cadence: "daily", metric: "number", unit: "pages", target_per_period: 10 },
      { title: "No impulse buys", icon: "💸", category: "money", cadence: "daily", metric: "bool" },
    ],
  },
];

/* ---------- goals & logs (P2) ---------- */

export async function listGoals(journeyId: string): Promise<Goal[]> {
  hydrate();
  return delay(clone(db.goals.filter((g) => g.journey_id === journeyId).sort((a, b) => a.sort_order - b.sort_order)));
}

export async function listLogs(journeyId: string): Promise<Log[]> {
  hydrate();
  return delay(clone(db.logs.filter((l) => l.journey_id === journeyId).sort((a, b) => a.date.localeCompare(b.date))));
}

export async function listGoalTemplates(): Promise<GoalTemplate[]> {
  hydrate();
  return delay(clone(MOCK_TEMPLATES));
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
  startsOn?: string;
  sortOrder?: number;
}): Promise<Goal> {
  hydrate();
  const goal: Goal = {
    id: `goal-${crypto.randomUUID()}`,
    journey_id: input.journeyId,
    owner_member_id: input.ownerMemberId,
    category: input.category,
    title: input.title,
    icon: input.icon ?? null,
    color: null,
    cadence: input.cadence ?? "daily",
    metric: input.metric ?? "bool",
    unit: input.unit ?? null,
    target_per_period: input.targetPerPeriod ?? null,
    target_total: input.targetTotal ?? null,
    starts_on: input.startsOn ?? todayISO(),
    sort_order: input.sortOrder ?? db.goals.length + 1,
    archived_at: null,
  };
  db.goals.push(goal);
  persist();
  return delay(clone(goal));
}

export async function updateGoal(goalId: string, patch: Partial<Goal>): Promise<void> {
  hydrate();
  const g = db.goals.find((x) => x.id === goalId);
  if (g) Object.assign(g, patch);
  persist();
  return delay(undefined);
}

export async function archiveGoal(goalId: string): Promise<void> {
  hydrate();
  const g = db.goals.find((x) => x.id === goalId);
  if (g) g.archived_at = new Date().toISOString();
  // Mirrors the real backend: a reminder for an archived goal would never
  // fire, and Settings hides archived goals, so the toggle would be stuck on
  // out of sight.
  db.reminders.filter((r) => r.goal_id === goalId).forEach((r) => (r.enabled = false));
  persist();
  return delay(undefined);
}

export async function applyGoalTemplate(input: {
  journeyId: string;
  ownerMemberId: string | null;
  template: GoalTemplate;
  startsOn?: string;
}): Promise<{ added: number; skipped: number }> {
  hydrate();
  const startsOn = input.startsOn ?? todayISO();

  // Same de-duplication as the real backend: adding a template you already
  // hold must not duplicate its goals.
  const held = new Set(
    db.goals
      .filter((g) => g.journey_id === input.journeyId && !g.archived_at)
      .map((g) => g.title.trim().toLowerCase()),
  );
  const fresh = input.template.goals.filter((g) => !held.has(g.title.trim().toLowerCase()));

  fresh.forEach((g, i) => {
    db.goals.push({
      id: `goal-${crypto.randomUUID()}`,
      journey_id: input.journeyId,
      owner_member_id: input.ownerMemberId,
      category: g.category ?? input.template.category,
      title: g.title,
      icon: g.icon ?? null,
      color: null,
      cadence: g.cadence ?? "daily",
      metric: g.metric ?? "bool",
      unit: g.unit ?? null,
      target_per_period: g.target_per_period ?? null,
      target_total: g.target_total ?? null,
      starts_on: startsOn,
      sort_order: db.goals.length + i + 1,
      archived_at: null,
    });
  });
  persist();
  return delay({ added: fresh.length, skipped: input.template.goals.length - fresh.length });
}

/**
 * Mirrors the real upsert, including the slot rule: dated goals are unique per
 * member per day, so a repeat tap updates rather than duplicating.
 */
export async function upsertGoalLog(input: {
  memberId: string;
  goalId: string;
  date: string;
  done?: boolean;
  amount?: number | null;
  note?: string | null;
}): Promise<void> {
  hydrate();
  const goal = db.goals.find((g) => g.id === input.goalId);
  if (!goal) throw new Error("Goal not found");
  const slot = goal.cadence === "open" ? null : input.date;

  const existing = db.logs.find(
    (l) => l.member_id === input.memberId && l.goal_id === input.goalId && l.slot === slot && slot !== null,
  );
  if (existing) {
    existing.done = input.done ?? true;
    existing.amount = input.amount ?? null;
    existing.note = input.note ?? null;
  } else {
    const member = db.members.find((m) => m.id === input.memberId);
    db.logs.push({
      id: `log-${crypto.randomUUID()}`,
      journey_id: member?.journey_id ?? goal.journey_id,
      member_id: input.memberId,
      goal_id: input.goalId,
      date: input.date,
      occurred_at: new Date().toISOString(),
      slot,
      done: input.done ?? true,
      amount: input.amount ?? null,
      note: input.note ?? null,
      place: null,
    });
  }
  persist();
  return delay(undefined);
}

export async function deleteGoalLog(input: {
  memberId: string;
  goalId: string;
  date: string;
}): Promise<void> {
  hydrate();
  db.logs = db.logs.filter(
    (l) => !(l.member_id === input.memberId && l.goal_id === input.goalId && l.date === input.date),
  );
  persist();
  return delay(undefined);
}

export async function addLog(input: {
  memberId: string;
  goalId: string | null;
  date: string;
  amount?: number | null;
  note?: string | null;
  place?: string | null;
}): Promise<Log> {
  hydrate();
  const member = db.members.find((m) => m.id === input.memberId);
  const goal = input.goalId ? db.goals.find((g) => g.id === input.goalId) : undefined;
  const log: Log = {
    id: `log-${crypto.randomUUID()}`,
    journey_id: member?.journey_id ?? goal?.journey_id ?? "",
    member_id: input.memberId,
    goal_id: input.goalId,
    date: input.date,
    occurred_at: new Date().toISOString(),
    // Open goals and memories both accumulate, so no slot.
    slot: goal && goal.cadence !== "open" ? input.date : null,
    done: true,
    amount: input.amount ?? null,
    note: input.note ?? null,
    place: input.place ?? null,
  };
  db.logs.push(log);
  persist();
  return delay(clone(log));
}

export async function deleteLog(logId: string): Promise<void> {
  hydrate();
  db.logs = db.logs.filter((l) => l.id !== logId);
  persist();
  return delay(undefined);
}

/* ---------- memories & media (P6) ---------- */

export async function listMedia(journeyId: string): Promise<Media[]> {
  hydrate();
  const logIds = new Set(db.logs.filter((l) => l.journey_id === journeyId).map((l) => l.id));
  return delay(
    clone(
      db.media
        .filter((m) => logIds.has(m.log_id))
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    ),
  );
}

/**
 * Mock mode has no object store, so photos become data URLs held in the mock
 * database. That keeps the feed genuinely renderable offline; what it does not
 * rehearse is storage RLS, which only exists on the real backend.
 */
export async function signedUrlsFor(paths: string[]): Promise<Record<string, string | null>> {
  hydrate();
  const out: Record<string, string | null> = {};
  for (const p of paths) out[p] = db.mediaData?.[p] ?? null;
  return delay(out);
}

export async function uploadMemoryPhoto(input: {
  journeyId: string;
  logId: string;
  file: File;
}): Promise<Media> {
  hydrate();
  const ext = (input.file.name.split(".").pop() ?? "jpg").toLowerCase();
  const path = `${input.journeyId}/${input.logId}/${crypto.randomUUID()}.${ext}`;

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read that file"));
    reader.readAsDataURL(input.file);
  });

  const media: Media = {
    id: `media-${crypto.randomUUID()}`,
    log_id: input.logId,
    storage_path: path,
    mime: input.file.type || null,
    width: null,
    height: null,
    bytes: input.file.size,
    created_at: new Date().toISOString(),
  };
  db.media.push(media);
  db.mediaData = { ...(db.mediaData ?? {}), [path]: dataUrl };
  persist();
  return delay(clone(media));
}

export async function deleteMedia(media: Media): Promise<void> {
  hydrate();
  db.media = db.media.filter((m) => m.id !== media.id);
  if (db.mediaData) delete db.mediaData[media.storage_path];
  persist();
  return delay(undefined);
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

export async function createPost(_input: {
  authorMemberId: string;
  journeyId: string;
  logId: string | null;
  body: string;
}): Promise<Post> {
  return delay({
    id: uid(),
    author_member_id: _input.authorMemberId,
    journey_id: _input.journeyId,
    log_id: _input.logId,
    body: _input.body,
    visibility: 'public' as const,
    created_at: new Date().toISOString(),
    author_name: 'You',
    author_avatar: null,
  });
}

export async function deletePost(_postId: string): Promise<void> {
  return delay(undefined);
}

export async function listFeedPosts(_input: {
  memberId: string;
  limit: number;
  cursor?: string;
}): Promise<Post[]> {
  return delay([]);
}

export async function listUserPosts(_input: {
  memberId: string;
  limit?: number;
}): Promise<Post[]> {
  return delay([]);
}

export async function followMember(_input: {
  followerMemberId: string;
  followingMemberId: string;
}): Promise<void> {
  return delay(undefined);
}

export async function unfollowMember(_input: {
  followerMemberId: string;
  followingMemberId: string;
}): Promise<void> {
  return delay(undefined);
}

export async function listFollowing(_memberId: string): Promise<Follow[]> {
  return delay([]);
}

export async function listFollowers(_memberId: string): Promise<Follow[]> {
  return delay([]);
}

export async function discoverMembers(_input: {
  memberId: string;
  limit: number;
}): Promise<DiscoverRow[]> {
  return delay([]);
}
