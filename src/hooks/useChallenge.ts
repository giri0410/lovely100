import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/mock/api";
import type { AvoidedExpense, Couple, DailyHabit, Profile } from "@/lib/challenge";

export interface WeeklyReview {
  id: string;
  profile_id: string;
  week_number: number;
  what_went_well: string | null;
  what_to_improve: string | null;
}

export interface Reminder {
  id: string;
  profile_id: string;
  reminder_type: string;
  enabled: boolean;
  reminder_time: string;
}

export function useSession() {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api.mockAuth.getSession().then(({ userId: id }) => {
      if (!active) return;
      setUserId(id);
      setLoading(false);
    });
    const unsubscribe = api.mockAuth.onChange((id) => setUserId(id));
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return { userId, loading };
}

export function useMyProfile(userId: string | null) {
  return useQuery({
    queryKey: ["my-profile", userId],
    enabled: !!userId,
    queryFn: (): Promise<Profile | null> => api.getMyProfile(userId!),
  });
}

export interface ChallengeData {
  couple: Couple;
  profiles: Profile[];
  habits: DailyHabit[];
  expenses: AvoidedExpense[];
  reviews: WeeklyReview[];
}

export function useChallengeData(coupleId: string | undefined) {
  return useQuery({
    queryKey: ["challenge", coupleId],
    enabled: !!coupleId,
    queryFn: (): Promise<ChallengeData> => api.getChallengeData(coupleId!),
  });
}

export function useHabitMutation(coupleId: string | undefined, profileId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ date, patch }: { date: string; patch: Partial<DailyHabit> }) =>
      api.upsertHabit({ coupleId: coupleId!, profileId: profileId!, date, patch }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["challenge", coupleId] }),
  });
}

export function useReminders(profileId: string | undefined) {
  return useQuery({
    queryKey: ["reminders", profileId],
    enabled: !!profileId,
    queryFn: (): Promise<Reminder[]> => api.listReminders(profileId!),
  });
}
