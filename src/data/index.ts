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

export const getMyProfile = useMock ? mockApi.getMyProfile : realApi.getMyProfile;
export const listUnclaimedProfiles = useMock ? mockApi.listUnclaimedProfiles : realApi.listUnclaimedProfiles;
export const claimProfile = useMock ? mockApi.claimProfile : realApi.claimProfile;
export const createCouple = useMock ? mockApi.createCouple : realApi.createCouple;
export const joinCouple = useMock ? mockApi.joinCouple : realApi.joinCouple;
export const updateProfileName = useMock ? mockApi.updateProfileName : realApi.updateProfileName;
export const updateCouple = useMock ? mockApi.updateCouple : realApi.updateCouple;

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
export const adminUpdateProfile = useMock ? mockApi.adminUpdateProfile : realApi.adminUpdateProfile;
export const deleteUser = useMock ? mockApi.deleteUser : realApi.deleteUser;
export const sendPasswordReset = useMock ? mockApi.sendPasswordReset : realApi.sendPasswordReset;

export type AdminUserRow = mockApi.AdminUserRow;
