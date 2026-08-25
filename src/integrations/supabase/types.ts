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
          journey_id: string
          created_at: string
          date: string
          description: string | null
          id: string
          member_id: string
          reason: string | null
        }
        Insert: {
          amount?: number
          journey_id: string
          created_at?: string
          date?: string
          description?: string | null
          id?: string
          member_id: string
          reason?: string | null
        }
        Update: {
          amount?: number
          journey_id?: string
          created_at?: string
          date?: string
          description?: string | null
          id?: string
          member_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "avoided_expenses_journey_id_fkey"
            columns: ["journey_id"]
            isOneToOne: false
            referencedRelation: "journeys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avoided_expenses_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      journeys: {
        Row: {
          created_at: string
          duration: number
          id: string
          invite_code: string
          is_demo: boolean
          kind: string
          name: string
          start_date: string
        }
        Insert: {
          created_at?: string
          duration?: number
          id?: string
          invite_code?: string
          is_demo?: boolean
          kind?: string
          name: string
          start_date?: string
        }
        Update: {
          created_at?: string
          duration?: number
          id?: string
          invite_code?: string
          is_demo?: boolean
          kind?: string
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
          journey_id: string
          created_at: string
          date: string
          healthy_food_completed: boolean
          id: string
          notes: string | null
          member_id: string
          unnecessary_spending_completed: boolean
          updated_at: string
          walk_completed: boolean
          walk_duration: number | null
        }
        Insert: {
          certification_completed?: boolean
          certification_minutes?: number | null
          certification_topic?: string | null
          journey_id: string
          created_at?: string
          date: string
          healthy_food_completed?: boolean
          id?: string
          notes?: string | null
          member_id: string
          unnecessary_spending_completed?: boolean
          updated_at?: string
          walk_completed?: boolean
          walk_duration?: number | null
        }
        Update: {
          certification_completed?: boolean
          certification_minutes?: number | null
          certification_topic?: string | null
          journey_id?: string
          created_at?: string
          date?: string
          healthy_food_completed?: boolean
          id?: string
          notes?: string | null
          member_id?: string
          unnecessary_spending_completed?: boolean
          updated_at?: string
          walk_completed?: boolean
          walk_duration?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_habits_journey_id_fkey"
            columns: ["journey_id"]
            isOneToOne: false
            referencedRelation: "journeys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_habits_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          auth_user_id: string | null
          avatar: string | null
          journey_id: string
          created_at: string
          id: string
          name: string
          relationship: string | null
        }
        Insert: {
          auth_user_id?: string | null
          avatar?: string | null
          journey_id: string
          created_at?: string
          id?: string
          name: string
          relationship?: string | null
        }
        Update: {
          auth_user_id?: string | null
          avatar?: string | null
          journey_id?: string
          created_at?: string
          id?: string
          name?: string
          relationship?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "members_journey_id_fkey"
            columns: ["journey_id"]
            isOneToOne: false
            referencedRelation: "journeys"
            referencedColumns: ["id"]
          },
        ]
      }
      reminders: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          member_id: string
          reminder_time: string
          reminder_type: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          member_id: string
          reminder_time?: string
          reminder_type: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          member_id?: string
          reminder_time?: string
          reminder_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
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
          journey_id: string
          created_at: string
          id: string
          member_id: string
          week_number: number
          what_to_improve: string | null
          what_went_well: string | null
        }
        Insert: {
          journey_id: string
          created_at?: string
          id?: string
          member_id: string
          week_number: number
          what_to_improve?: string | null
          what_went_well?: string | null
        }
        Update: {
          journey_id?: string
          created_at?: string
          id?: string
          member_id?: string
          week_number?: number
          what_to_improve?: string | null
          what_went_well?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "weekly_reviews_journey_id_fkey"
            columns: ["journey_id"]
            isOneToOne: false
            referencedRelation: "journeys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_reviews_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_journey_with_member: {
        Args: {
          _journey_name: string
          _member_name: string
          _relationship: string
          _kind: string
        }
        Returns: Database["public"]["Tables"]["journeys"]["Row"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      join_journey_by_code: {
        Args: {
          _invite_code: string
          _name: string
          _relationship: string
        }
        Returns: Database["public"]["Tables"]["journeys"]["Row"]
      }
      my_journey_id: { Args: never; Returns: string }
      my_member_id: { Args: never; Returns: string }
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
