/**
 * Backend switch. Everything the UI needs comes from this module, never
 * directly from "@/mock/api" or "@/data/supabase-api".
 *
 * Set VITE_BACKEND_MODE=mock in .env to use the in-memory demo data instead
 * of the real Supabase backend (useful for offline dev).
 */
import * as mockApi from "@/mock/api";
import * as realApi from "./supabase-api";

const useMock = import.meta.env["VITE_BACKEND_MODE"] === "mock";

export const auth = useMock ? mockApi.mockAuth : realApi.auth;

export const getMyMember = useMock ? mockApi.getMyMember : realApi.getMyMember;
export const createJourney = useMock ? mockApi.createJourney : realApi.createJourney;
export const joinJourney = useMock ? mockApi.joinJourney : realApi.joinJourney;
export const updateMemberName = useMock ? mockApi.updateMemberName : realApi.updateMemberName;
export const updateJourney = useMock ? mockApi.updateJourney : realApi.updateJourney;

export const getChallengeData = useMock ? mockApi.getChallengeData : realApi.getChallengeData;
export const upsertHabit = useMock ? mockApi.upsertHabit : realApi.upsertHabit;

export const addExpense = useMock ? mockApi.addExpense : realApi.addExpense;
export const deleteExpense = useMock ? mockApi.deleteExpense : realApi.deleteExpense;

export const upsertReview = useMock ? mockApi.upsertReview : realApi.upsertReview;

export const listReminders = useMock ? mockApi.listReminders : realApi.listReminders;
export const upsertReminder = useMock ? mockApi.upsertReminder : realApi.upsertReminder;

export const getAdminStatus = useMock ? mockApi.getAdminStatus : realApi.getAdminStatus;
export const claimFirstAdmin = useMock ? mockApi.claimFirstAdmin : realApi.claimFirstAdmin;
export const listUsers = useMock ? mockApi.listUsers : realApi.listUsers;
export const setUserAdmin = useMock ? mockApi.setUserAdmin : realApi.setUserAdmin;
export const adminUpdateMember = useMock ? mockApi.adminUpdateMember : realApi.adminUpdateMember;
export const deleteUser = useMock ? mockApi.deleteUser : realApi.deleteUser;
export const sendPasswordReset = useMock ? mockApi.sendPasswordReset : realApi.sendPasswordReset;

export type AdminUserRow = mockApi.AdminUserRow;
