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
import type { AvoidedExpense, Couple, DailyHabit, Profile } from "@/lib/challenge";
import { todayISO } from "@/lib/challenge";
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
  /** Stand-in for a social login: signs into (or creates) a demo account. */
  async signInWithGoogle(): Promise<string> {
    hydrate();
    await delay(null);
    let user = db.users.find((u) => u.email === "google.user@100days.app");
    if (!user) {
      user = {
        id: uid("user"),
        email: "google.user@100days.app",
        password: uid("pw"),
        created_at: new Date().toISOString(),
        last_sign_in_at: new Date().toISOString(),
        email_confirmed: true,
        is_admin: false,
      };
      db.users.push(user);
    }
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
};

/* ------------------------------ profiles -------------------------------- */

export async function getMyProfile(userId: string): Promise<Profile | null> {
  hydrate();
  return delay(clone(db.profiles.find((p) => p.auth_user_id === userId) ?? null));
}

export async function listUnclaimedProfiles(): Promise<Profile[]> {
  hydrate();
  return delay(clone(db.profiles.filter((p) => p.auth_user_id === null)));
}

export async function claimProfile(profileId: string, userId: string): Promise<void> {
  hydrate();
  await delay(null);
  const profile = db.profiles.find((p) => p.id === profileId);
  if (!profile) throw new Error("That profile no longer exists.");
  profile.auth_user_id = userId;
  persist();
}

export async function createCouple(input: {
  userId: string;
  name: string;
  coupleName: string;
  relationship: string;
}): Promise<Couple> {
  hydrate();
  await delay(null);
  const couple: Couple = {
    id: uid("couple"),
    name: input.coupleName || `${input.name}'s challenge`,
    start_date: todayISO(),
    duration: 100,
    invite_code: uid("").slice(1, 7).toUpperCase(),
    is_demo: false,
  };
  db.couples.push(couple);
  db.profiles.push({
    id: uid("profile"),
    auth_user_id: input.userId,
    couple_id: couple.id,
    name: input.name,
    relationship: input.relationship,
    avatar: null,
  });
  persist();
  return clone(couple);
}

export async function joinCouple(input: {
  userId: string;
  name: string;
  relationship: string;
  inviteCode: string;
}): Promise<void> {
  hydrate();
  await delay(null);
  const couple = db.couples.find((c) => c.invite_code === input.inviteCode.trim().toUpperCase());
  if (!couple) throw new Error("We couldn't find that invite code");
  db.profiles.push({
    id: uid("profile"),
    auth_user_id: input.userId,
    couple_id: couple.id,
    name: input.name,
    relationship: input.relationship,
    avatar: null,
  });
  persist();
}

export async function updateProfileName(profileId: string, name: string): Promise<void> {
  hydrate();
  await delay(null);
  const profile = db.profiles.find((p) => p.id === profileId);
  if (profile) profile.name = name.trim();
  persist();
}

export async function updateCouple(coupleId: string, patch: { name: string; start_date: string }): Promise<void> {
  hydrate();
  await delay(null);
  const couple = db.couples.find((c) => c.id === coupleId);
  if (couple) Object.assign(couple, { name: patch.name, start_date: patch.start_date });
  persist();
}

/* ---------------------------- challenge data ---------------------------- */

export interface MockChallengeData {
  couple: Couple;
  profiles: Profile[];
  habits: DailyHabit[];
  expenses: AvoidedExpense[];
  reviews: MockWeeklyReview[];
}

export async function getChallengeData(coupleId: string): Promise<MockChallengeData> {
  hydrate();
  const couple = db.couples.find((c) => c.id === coupleId);
  if (!couple) throw new Error("Challenge not found");
  const profileIds = db.profiles.filter((p) => p.couple_id === coupleId).map((p) => p.id);
  return delay(
    clone({
      couple,
      profiles: db.profiles.filter((p) => p.couple_id === coupleId),
      habits: db.habits.filter((h) => h.couple_id === coupleId).sort((a, b) => a.date.localeCompare(b.date)),
      expenses: db.expenses
        .filter((e) => profileIds.includes(e.profile_id))
        .sort((a, b) => b.date.localeCompare(a.date)),
      reviews: db.reviews.filter((r) => r.couple_id === coupleId),
    }),
  );
}

export async function upsertHabit(input: {
  coupleId: string;
  profileId: string;
  date: string;
  patch: Partial<DailyHabit>;
}): Promise<void> {
  hydrate();
  await delay(null);
  const existing = db.habits.find((h) => h.profile_id === input.profileId && h.date === input.date);
  if (existing) {
    Object.assign(existing, input.patch);
  } else {
    db.habits.push({
      id: uid("habit"),
      couple_id: input.coupleId,
      profile_id: input.profileId,
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
  coupleId?: string;
  profileId: string;
  amount: number;
  description: string | null;
  reason: string | null;
  date: string;
}): Promise<void> {
  hydrate();
  await delay(null);
  db.expenses.push({
    id: uid("expense"),
    profile_id: input.profileId,
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
  coupleId: string;
  profileId: string;
  weekNumber: number;
  whatWentWell: string | null;
  whatToImprove: string | null;
}): Promise<void> {
  hydrate();
  await delay(null);
  const existing = db.reviews.find((r) => r.profile_id === input.profileId && r.week_number === input.weekNumber);
  if (existing) {
    existing.what_went_well = input.whatWentWell;
    existing.what_to_improve = input.whatToImprove;
  } else {
    db.reviews.push({
      id: uid("review"),
      couple_id: input.coupleId,
      profile_id: input.profileId,
      week_number: input.weekNumber,
      what_went_well: input.whatWentWell,
      what_to_improve: input.whatToImprove,
    });
  }
  persist();
}

/* ------------------------------ reminders ------------------------------- */

export async function listReminders(profileId: string): Promise<MockReminder[]> {
  hydrate();
  return delay(clone(db.reminders.filter((r) => r.profile_id === profileId)));
}

export async function upsertReminder(input: {
  profileId: string;
  type: string;
  enabled: boolean;
  time: string;
}): Promise<void> {
  hydrate();
  await delay(null);
  const existing = db.reminders.find((r) => r.profile_id === input.profileId && r.reminder_type === input.type);
  if (existing) {
    existing.enabled = input.enabled;
    existing.reminder_time = input.time;
  } else {
    db.reminders.push({
      id: uid("rem"),
      profile_id: input.profileId,
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
  profileId: string | null;
  name: string | null;
  relationship: string | null;
  coupleId: string | null;
  coupleName: string | null;
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
      const profile = db.profiles.find((p) => p.auth_user_id === u.id) ?? null;
      const couple = profile ? db.couples.find((c) => c.id === profile.couple_id) : undefined;
      return {
        authUserId: u.id,
        email: u.email,
        createdAt: u.created_at,
        lastSignInAt: u.last_sign_in_at,
        emailConfirmed: u.email_confirmed,
        isAdmin: u.is_admin,
        profileId: profile?.id ?? null,
        name: profile?.name ?? null,
        relationship: profile?.relationship ?? null,
        coupleId: profile?.couple_id ?? null,
        coupleName: couple?.name ?? null,
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

export async function adminUpdateProfile(profileId: string, name: string, relationship: string): Promise<void> {
  hydrate();
  await delay(null);
  const profile = db.profiles.find((p) => p.id === profileId);
  if (profile) {
    profile.name = name.trim();
    profile.relationship = relationship.trim();
  }
  persist();
}

export async function deleteUser(userId: string): Promise<void> {
  hydrate();
  await delay(null);
  db.profiles.forEach((p) => {
    if (p.auth_user_id === userId) p.auth_user_id = null;
  });
  db.users = db.users.filter((u) => u.id !== userId);
  persist();
}

export async function sendPasswordReset(_email: string): Promise<void> {
  hydrate();
  await delay(null);
}
