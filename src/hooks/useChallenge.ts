import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/data";
import type { AvoidedExpense, Journey, DailyHabit, Member } from "@/lib/challenge";

export interface WeeklyReview {
  id: string;
  member_id: string;
  week_number: number;
  what_went_well: string | null;
  what_to_improve: string | null;
}

export interface Reminder {
  id: string;
  member_id: string;
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

export function useMyMember(userId: string | null) {
  return useQuery({
    queryKey: ["my-member", userId],
    enabled: !!userId,
    queryFn: (): Promise<Member | null> => api.getMyMember(userId!),
  });
}

export interface ChallengeData {
  journey: Journey;
  members: Member[];
  habits: DailyHabit[];
  expenses: AvoidedExpense[];
  reviews: WeeklyReview[];
}

export function useChallengeData(journeyId: string | undefined) {
  return useQuery({
    queryKey: ["challenge", journeyId],
    enabled: !!journeyId,
    queryFn: (): Promise<ChallengeData> => api.getChallengeData(journeyId!),
  });
}

export function useHabitMutation(journeyId: string | undefined, memberId: string | undefined) {
  const qc = useQueryClient();
  const queryKey = ["challenge", journeyId];

  return useMutation({
    mutationFn: ({ date, patch }: { date: string; patch: Partial<DailyHabit> }) =>
      api.upsertHabit({ journeyId: journeyId!, memberId: memberId!, date, patch }),

    // Move the checkmark now, reconcile later. Without this every tap waits on
    // a five-table refetch, which is the whole "30 seconds a day" budget.
    onMutate: async ({ date, patch }) => {
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData<ChallengeData>(queryKey);
      if (!previous || !memberId || !journeyId) return { previous };

      const index = previous.habits.findIndex((h) => h.member_id === memberId && h.date === date);
      const habits =
        index >= 0
          ? previous.habits.map((h, i) => (i === index ? { ...h, ...patch } : h))
          : [
              ...previous.habits,
              {
                id: `optimistic-${memberId}-${date}`,
                journey_id: journeyId,
                member_id: memberId,
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

export function useReminders(memberId: string | undefined) {
  return useQuery({
    queryKey: ["reminders", memberId],
    enabled: !!memberId,
    queryFn: (): Promise<Reminder[]> => api.listReminders(memberId!),
  });
}
