import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/data";
import type { AvoidedExpense, Journey, DailyHabit, Member } from "@/lib/challenge";
import type { Goal, Log, Media } from "@/lib/goals";

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
  /** 'goal' | 'daily' | 'weekly'. */
  reminder_type: string;
  /** Set only for a 'goal' reminder. */
  goal_id: string | null;
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
  /**
   * The pre-P2 habit rows. Still fetched because nothing reads them any more
   * but the table is not dropped until the new path has proven itself in
   * production. Remove this, the table, and the fetch together.
   */
  habits: DailyHabit[];
  expenses: AvoidedExpense[];
  reviews: WeeklyReview[];
  goals: Goal[];
  logs: Log[];
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

/**
 * Toggle a dated goal (daily or weekly) for one day.
 *
 * The old useHabitMutation patched a single cached row because there was
 * exactly one habit row per member per day. Logs are a list, and the same goal
 * can be logged, untoggled and logged again, so the optimistic update
 * replaces-or-appends rather than patching in place.
 */
export function useGoalLogMutation(journeyId: string | undefined, memberId: string | undefined) {
  const qc = useQueryClient();
  const queryKey = ["challenge", journeyId];

  return useMutation({
    mutationFn: ({
      goal,
      date,
      on,
      amount,
      note,
    }: {
      goal: Goal;
      date: string;
      on: boolean;
      amount?: number | null;
      note?: string | null;
    }) =>
      on
        ? api.upsertGoalLog({
            memberId: memberId!,
            goalId: goal.id,
            date,
            amount: amount ?? null,
            note: note ?? null,
          })
        : api.deleteGoalLog({ memberId: memberId!, goalId: goal.id, date }),

    // Move the checkmark now, reconcile later. A tap that waits on a
    // seven-table refetch spends the whole "30 seconds a day" budget.
    onMutate: async ({ goal, date, on, amount, note }) => {
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData<ChallengeData>(queryKey);
      if (!previous || !memberId || !journeyId) return { previous };

      const matches = (l: Log) =>
        l.member_id === memberId && l.goal_id === goal.id && l.date === date;

      let logs: Log[];
      if (!on) {
        logs = previous.logs.filter((l) => !matches(l));
      } else if (previous.logs.some(matches)) {
        logs = previous.logs.map((l) =>
          matches(l) ? { ...l, done: true, amount: amount ?? null, note: note ?? null } : l,
        );
      } else {
        logs = [
          ...previous.logs,
          {
            id: `optimistic-${goal.id}-${date}`,
            journey_id: journeyId,
            member_id: memberId,
            goal_id: goal.id,
            date,
            occurred_at: new Date().toISOString(),
            // Mirrors the database trigger: dated goals get the date, open
            // goals get nothing.
            slot: goal.cadence === "open" ? null : date,
            done: true,
            amount: amount ?? null,
            note: note ?? null,
            place: null,
          },
        ];
      }

      qc.setQueryData<ChallengeData>(queryKey, { ...previous, logs });
      return { previous };
    },

    onError: (_error, _variables, context) => {
      if (context?.previous) qc.setQueryData(queryKey, context.previous);
    },

    // Refetch either way so the optimistic row picks up its real id and the
    // slot the trigger actually assigned.
    onSettled: () => qc.invalidateQueries({ queryKey }),
  });
}

/**
 * Add a log that always inserts: open goals and memories both allow many per
 * day, so there is nothing to upsert against.
 */
export function useAddLogMutation(journeyId: string | undefined, memberId: string | undefined) {
  const qc = useQueryClient();
  const queryKey = ["challenge", journeyId];

  return useMutation({
    mutationFn: (input: {
      goalId: string | null;
      date: string;
      amount?: number | null;
      note?: string | null;
      place?: string | null;
    }) => api.addLog({ memberId: memberId!, ...input }),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });
}

export function useDeleteLogMutation(journeyId: string | undefined) {
  const qc = useQueryClient();
  const queryKey = ["challenge", journeyId];

  return useMutation({
    mutationFn: (logId: string) => api.deleteLog(logId),
    onMutate: async (logId) => {
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData<ChallengeData>(queryKey);
      if (previous) {
        qc.setQueryData<ChallengeData>(queryKey, {
          ...previous,
          logs: previous.logs.filter((l) => l.id !== logId),
        });
      }
      return { previous };
    },
    onError: (_e, _v, context) => {
      if (context?.previous) qc.setQueryData(queryKey, context.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey }),
  });
}

/* ---------- goal management ---------- */

export function useGoalTemplates() {
  return useQuery({
    queryKey: ["goal-templates"],
    queryFn: () => api.listGoalTemplates(),
    // Reference data: it only changes when a migration adds a template.
    staleTime: Infinity,
  });
}

export function useGoalMutations(journeyId: string | undefined) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["challenge", journeyId] });

  return {
    create: useMutation({ mutationFn: api.createGoal, onSuccess: invalidate }),
    update: useMutation({
      mutationFn: ({ goalId, patch }: { goalId: string; patch: Partial<Goal> }) =>
        api.updateGoal(goalId, patch),
      onSuccess: invalidate,
    }),
    archive: useMutation({ mutationFn: api.archiveGoal, onSuccess: invalidate }),
    applyTemplate: useMutation({ mutationFn: api.applyGoalTemplate, onSuccess: invalidate }),
  };
}

/* ---------- memories & media (P6) ---------- */

export function useMedia(journeyId: string | undefined) {
  return useQuery({
    queryKey: ["media", journeyId],
    enabled: !!journeyId,
    queryFn: () => api.listMedia(journeyId!),
  });
}

/**
 * Signed URLs for a set of storage paths.
 *
 * The bucket is private so these expire; the query is keyed on the sorted path
 * list and refreshed well inside the hour the server grants, because a stale
 * URL renders as a broken image rather than an error anyone can act on.
 */
export function useSignedUrls(paths: string[]) {
  const key = [...paths].sort();
  return useQuery({
    queryKey: ["signed-urls", key],
    enabled: paths.length > 0,
    queryFn: () => api.signedUrlsFor(key),
    staleTime: 45 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });
}

export function useMemoryMutations(journeyId: string | undefined, memberId: string | undefined) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["challenge", journeyId] });
    qc.invalidateQueries({ queryKey: ["media", journeyId] });
  };

  return {
    /** A memory is a log with no goal, optionally carrying a photo. */
    add: useMutation({
      mutationFn: async (input: { date: string; note: string | null; place: string | null; file?: File | null }) => {
        const log = await api.addLog({
          memberId: memberId!,
          goalId: null,
          date: input.date,
          note: input.note,
          place: input.place,
        });
        if (input.file) {
          await api.uploadMemoryPhoto({ journeyId: journeyId!, logId: log.id, file: input.file });
        }
        return log;
      },
      onSuccess: invalidate,
    }),

    /** Attach a photo to a memory that already exists. */
    attach: useMutation({
      mutationFn: (input: { logId: string; file: File }) =>
        api.uploadMemoryPhoto({ journeyId: journeyId!, logId: input.logId, file: input.file }),
      onSuccess: invalidate,
    }),

    removePhoto: useMutation({
      mutationFn: (media: Media) => api.deleteMedia(media),
      onSuccess: invalidate,
    }),

    remove: useMutation({
      mutationFn: (logId: string) => api.deleteLog(logId),
      onSuccess: invalidate,
    }),
  };
}
