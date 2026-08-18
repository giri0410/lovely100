/**
 * Seed data for the mock backend.
 *
 * Everything the UI shows comes from here. When a real backend is wired up,
 * replace `src/mock/api.ts` with real network calls — the UI and hooks only
 * ever talk to that module, never to this file directly.
 */
import { addDays, toISO, type AvoidedExpense, type Couple, type DailyHabit, type Profile } from "@/lib/challenge";

export interface MockWeeklyReview {
  id: string;
  couple_id: string;
  profile_id: string;
  week_number: number;
  what_went_well: string | null;
  what_to_improve: string | null;
}

export interface MockReminder {
  id: string;
  profile_id: string;
  reminder_type: string;
  enabled: boolean;
  reminder_time: string;
}

export interface MockUser {
  id: string;
  email: string;
  password: string;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed: boolean;
  is_admin: boolean;
}

export interface MockDatabase {
  users: MockUser[];
  couples: Couple[];
  profiles: Profile[];
  habits: DailyHabit[];
  expenses: AvoidedExpense[];
  reviews: MockWeeklyReview[];
  reminders: MockReminder[];
  sessionUserId: string | null;
}

export const DEMO_COUPLE_ID = "couple-demo";
export const DEMO_ALEX_ID = "profile-alex";
export const DEMO_PRIYA_ID = "profile-priya";
export const DEMO_DAYS = 9;

export function uid(prefix = "id"): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

const EXPENSE_IDEAS: { description: string; reason: string; amount: number }[] = [
  { description: "Restaurant dinner", reason: "Cooked at home instead", amount: 1450 },
  { description: "Cab to office", reason: "Walked and took the metro", amount: 260 },
  { description: "Impulse sneakers", reason: "Slept on it, didn't need them", amount: 4200 },
  { description: "Coffee shop runs", reason: "Made filter coffee at home", amount: 380 },
  { description: "Food delivery", reason: "Meal-prepped on Sunday", amount: 720 },
  { description: "New headphones", reason: "Old ones still work fine", amount: 3100 },
  { description: "Weekend movie tickets", reason: "Home movie night", amount: 900 },
];

const STUDY_TOPICS = ["AWS Solutions Architect", "Data structures", "Product analytics", "Financial planning"];

function makeHabit(
  profileId: string,
  date: string,
  done: { walk: boolean; food: boolean; spending: boolean; cert: boolean },
  index: number,
): DailyHabit {
  return {
    id: uid("habit"),
    couple_id: DEMO_COUPLE_ID,
    profile_id: profileId,
    date,
    walk_completed: done.walk,
    walk_duration: done.walk ? 30 + (index % 3) * 5 : null,
    healthy_food_completed: done.food,
    unnecessary_spending_completed: done.spending,
    certification_completed: done.cert,
    certification_minutes: done.cert ? 30 + (index % 4) * 10 : null,
    certification_topic: done.cert ? STUDY_TOPICS[index % STUDY_TOPICS.length]! : null,
    notes: null,
  };
}

/** Deterministic-ish completion pattern so the demo looks lived-in, not perfect. */
const ALEX_PATTERN = [
  [1, 1, 1, 1],
  [1, 1, 1, 1],
  [1, 0, 1, 1],
  [1, 1, 1, 0],
  [1, 1, 1, 1],
  [0, 1, 1, 1],
  [1, 1, 0, 1],
  [1, 1, 1, 1],
  [1, 1, 1, 0],
];

const PRIYA_PATTERN = [
  [1, 1, 1, 1],
  [1, 1, 0, 1],
  [1, 1, 1, 1],
  [1, 1, 1, 1],
  [0, 1, 1, 1],
  [1, 1, 1, 1],
  [1, 0, 1, 1],
  [1, 1, 1, 1],
  [1, 1, 1, 1],
];

export function createSeedDatabase(): MockDatabase {
  const today = toISO(new Date());
  const startDate = addDays(today, -(DEMO_DAYS - 1));

  const couple: Couple = {
    id: DEMO_COUPLE_ID,
    name: "Alex & Priya's 100 Days",
    start_date: startDate,
    duration: 100,
    invite_code: "ALPR26",
    is_demo: true,
  };

  const profiles: Profile[] = [
    { id: DEMO_ALEX_ID, auth_user_id: null, couple_id: couple.id, name: "Alex", relationship: "me", avatar: null },
    { id: DEMO_PRIYA_ID, auth_user_id: null, couple_id: couple.id, name: "Priya", relationship: "wife", avatar: null },
  ];

  const habits: DailyHabit[] = [];
  for (let i = 0; i < DEMO_DAYS; i++) {
    const date = addDays(startDate, i);
    const a = ALEX_PATTERN[i]!;
    const p = PRIYA_PATTERN[i]!;
    habits.push(
      makeHabit(DEMO_ALEX_ID, date, { walk: !!a[0], food: !!a[1], spending: !!a[2], cert: !!a[3] }, i),
      makeHabit(DEMO_PRIYA_ID, date, { walk: !!p[0], food: !!p[1], spending: !!p[2], cert: !!p[3] }, i + 1),
    );
  }

  const expenses: AvoidedExpense[] = EXPENSE_IDEAS.map((e, i) => ({
    id: uid("expense"),
    profile_id: i % 2 === 0 ? DEMO_ALEX_ID : DEMO_PRIYA_ID,
    date: addDays(startDate, Math.min(i, DEMO_DAYS - 1)),
    amount: e.amount,
    description: e.description,
    reason: e.reason,
  }));

  const reviews: MockWeeklyReview[] = [
    {
      id: uid("review"),
      couple_id: couple.id,
      profile_id: DEMO_ALEX_ID,
      week_number: 1,
      what_went_well: "Walked together six mornings and stuck to the meal plan.",
      what_to_improve: "Study earlier in the evening instead of after 10pm.",
    },
    {
      id: uid("review"),
      couple_id: couple.id,
      profile_id: DEMO_PRIYA_ID,
      week_number: 1,
      what_went_well: "Skipped three deliveries and cooked instead.",
      what_to_improve: "Plan Sunday's cheat meal at home so it stays budget-friendly.",
    },
  ];

  const reminders: MockReminder[] = [
    { id: uid("rem"), profile_id: DEMO_ALEX_ID, reminder_type: "walk", enabled: true, reminder_time: "06:30" },
    { id: uid("rem"), profile_id: DEMO_ALEX_ID, reminder_type: "daily", enabled: true, reminder_time: "21:30" },
  ];

  const users: MockUser[] = [
    {
      id: "user-demo",
      email: "demo@100days.app",
      password: "demo1234",
      created_at: new Date(Date.now() - 9 * 86400000).toISOString(),
      last_sign_in_at: new Date().toISOString(),
      email_confirmed: true,
      is_admin: true,
    },
  ];

  return { users, couples: [couple], profiles, habits, expenses, reviews, reminders, sessionUserId: null };
}
