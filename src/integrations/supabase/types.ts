export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      avoided_expenses: {
        Row: {
          amount: number
          couple_id: string
          created_at: string
          date: string
          description: string | null
          id: string
          profile_id: string
          reason: string | null
        }
        Insert: {
          amount?: number
          couple_id: string
          created_at?: string
          date?: string
          description?: string | null
          id?: string
          profile_id: string
          reason?: string | null
        }
        Update: {
          amount?: number
          couple_id?: string
          created_at?: string
          date?: string
          description?: string | null
          id?: string
          profile_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "avoided_expenses_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avoided_expenses_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      couples: {
        Row: {
          created_at: string
          duration: number
          id: string
          invite_code: string
          is_demo: boolean
          name: string
          start_date: string
        }
        Insert: {
          created_at?: string
          duration?: number
          id?: string
          invite_code?: string
          is_demo?: boolean
          name: string
          start_date?: string
        }
        Update: {
          created_at?: string
          duration?: number
          id?: string
          invite_code?: string
          is_demo?: boolean
          name?: string
          start_date?: string
        }
        Relationships: []
      }
      daily_habits: {
        Row: {
          certification_completed: boolean
          certification_minutes: number | null
          certification_topic: string | null
          couple_id: string
          created_at: string
          date: string
          healthy_food_completed: boolean
          id: string
          notes: string | null
          profile_id: string
          unnecessary_spending_completed: boolean
          updated_at: string
          walk_completed: boolean
          walk_duration: number | null
        }
        Insert: {
          certification_completed?: boolean
          certification_minutes?: number | null
          certification_topic?: string | null
          couple_id: string
          created_at?: string
          date: string
          healthy_food_completed?: boolean
          id?: string
          notes?: string | null
          profile_id: string
          unnecessary_spending_completed?: boolean
          updated_at?: string
          walk_completed?: boolean
          walk_duration?: number | null
        }
        Update: {
          certification_completed?: boolean
          certification_minutes?: number | null
          certification_topic?: string | null
          couple_id?: string
          created_at?: string
          date?: string
          healthy_food_completed?: boolean
          id?: string
          notes?: string | null
          profile_id?: string
          unnecessary_spending_completed?: boolean
          updated_at?: string
          walk_completed?: boolean
          walk_duration?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_habits_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_habits_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          auth_user_id: string | null
          avatar: string | null
          couple_id: string
          created_at: string
          id: string
          name: string
          relationship: string
        }
        Insert: {
          auth_user_id?: string | null
          avatar?: string | null
          couple_id: string
          created_at?: string
          id?: string
          name: string
          relationship?: string
        }
        Update: {
          auth_user_id?: string | null
          avatar?: string | null
          couple_id?: string
          created_at?: string
          id?: string
          name?: string
          relationship?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      reminders: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          profile_id: string
          reminder_time: string
          reminder_type: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          profile_id: string
          reminder_time?: string
          reminder_type: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          profile_id?: string
          reminder_time?: string
          reminder_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      weekly_reviews: {
        Row: {
          couple_id: string
          created_at: string
          id: string
          profile_id: string
          week_number: number
          what_to_improve: string | null
          what_went_well: string | null
        }
        Insert: {
          couple_id: string
          created_at?: string
          id?: string
          profile_id: string
          week_number: number
          what_to_improve?: string | null
          what_went_well?: string | null
        }
        Update: {
          couple_id?: string
          created_at?: string
          id?: string
          profile_id?: string
          week_number?: number
          what_to_improve?: string | null
          what_went_well?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "weekly_reviews_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_reviews_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_couple_with_profile: {
        Args: {
          _couple_name: string
          _profile_name: string
          _relationship: string
        }
        Returns: Database["public"]["Tables"]["couples"]["Row"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      join_couple_by_code: {
        Args: {
          _invite_code: string
          _name: string
          _relationship: string
        }
        Returns: Database["public"]["Tables"]["couples"]["Row"]
      }
      my_couple_id: { Args: never; Returns: string }
      my_profile_id: { Args: never; Returns: string }
    }
    Enums: {
      app_role: "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
