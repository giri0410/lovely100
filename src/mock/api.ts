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
  enabled: boolean;
  time: string;
}): Promise<void> {
  hydrate();
  await delay(null);
  const existing = db.reminders.find((r) => r.member_id === input.memberId && r.reminder_type === input.type);
  if (existing) {
    existing.enabled = input.enabled;
    existing.reminder_time = input.time;
  } else {
    db.reminders.push({
      id: uid("rem"),
      member_id: input.memberId,
      reminder_type: input.type,
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
