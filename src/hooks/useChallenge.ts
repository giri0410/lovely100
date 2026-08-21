import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/data";
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
    api.auth.getSession().then(({ userId: id }) => {
      if (!active) return;
      setUserId(id);
      setLoading(false);
    });
    const unsubscribe = api.auth.onChange((id) => setUserId(id));
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
  const queryKey = ["challenge", coupleId];

  return useMutation({
    mutationFn: ({ date, patch }: { date: string; patch: Partial<DailyHabit> }) =>
      api.upsertHabit({ coupleId: coupleId!, profileId: profileId!, date, patch }),

    // Move the checkmark now, reconcile later. Without this every tap waits on
    // a five-table refetch, which is the whole "30 seconds a day" budget.
    onMutate: async ({ date, patch }) => {
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData<ChallengeData>(queryKey);
      if (!previous || !profileId || !coupleId) return { previous };

      const index = previous.habits.findIndex((h) => h.profile_id === profileId && h.date === date);
      const habits =
        index >= 0
          ? previous.habits.map((h, i) => (i === index ? { ...h, ...patch } : h))
          : [
              ...previous.habits,
              {
                id: `optimistic-${profileId}-${date}`,
                couple_id: coupleId,
                profile_id: profileId,
                date,
                walk_completed: false,
                walk_duration: null,
                healthy_food_completed: false,
                unnecessary_spending_completed: false,
                certification_completed: false,
                certification_minutes: null,
                certification_topic: null,
                notes: null,
                ...patch,
              } satisfies DailyHabit,
            ];

      qc.setQueryData<ChallengeData>(queryKey, { ...previous, habits });
      return { previous };
    },

    onError: (_error, _variables, context) => {
      if (context?.previous) qc.setQueryData(queryKey, context.previous);
    },

    // Refetch either way so the optimistic row picks up its real id and any
    // server-side defaults.
    onSettled: () => qc.invalidateQueries({ queryKey }),
  });
}

export function useReminders(profileId: string | undefined) {
  return useQuery({
    queryKey: ["reminders", profileId],
    enabled: !!profileId,
    queryFn: (): Promise<Reminder[]> => api.listReminders(profileId!),
  });
}
