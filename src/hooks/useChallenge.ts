import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setUserId(data.session?.user.id ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user.id ?? null);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { userId, loading };
}

export function useMyProfile(userId: string | null) {
  return useQuery({
    queryKey: ["my-profile", userId],
    enabled: !!userId,
    queryFn: async (): Promise<Profile | null> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("auth_user_id", userId!)
        .maybeSingle();
      if (error) throw error;
      return (data as Profile | null) ?? null;
    },
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
    queryFn: async (): Promise<ChallengeData> => {
      const [couple, profiles, habits, expenses, reviews] = await Promise.all([
        supabase.from("couples").select("*").eq("id", coupleId!).single(),
        supabase.from("profiles").select("*").eq("couple_id", coupleId!).order("created_at"),
        supabase.from("daily_habits").select("*").eq("couple_id", coupleId!).order("date"),
        supabase.from("avoided_expenses").select("*").eq("couple_id", coupleId!).order("date", { ascending: false }),
        supabase.from("weekly_reviews").select("*").eq("couple_id", coupleId!),
      ]);
      const err = couple.error || profiles.error || habits.error || expenses.error || reviews.error;
      if (err) throw err;
      return {
        couple: couple.data as unknown as Couple,
        profiles: (profiles.data ?? []) as unknown as Profile[],
        habits: (habits.data ?? []) as unknown as DailyHabit[],
        expenses: (expenses.data ?? []).map((e) => ({ ...e, amount: Number(e.amount) })) as unknown as AvoidedExpense[],
        reviews: (reviews.data ?? []) as unknown as WeeklyReview[],
      };
    },
  });
}

export function useHabitMutation(coupleId: string | undefined, profileId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ date, patch }: { date: string; patch: Partial<DailyHabit> }) => {
      const { error } = await supabase
        .from("daily_habits")
        .upsert(
          { couple_id: coupleId!, profile_id: profileId!, date, ...patch } as never,
          { onConflict: "profile_id,date" },
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["challenge", coupleId] }),
  });
}

export function useReminders(profileId: string | undefined) {
  return useQuery({
    queryKey: ["reminders", profileId],
    enabled: !!profileId,
    queryFn: async (): Promise<Reminder[]> => {
      const { data, error } = await supabase.from("reminders").select("*").eq("profile_id", profileId!);
      if (error) throw error;
      return (data ?? []) as unknown as Reminder[];
    },
  });
}
