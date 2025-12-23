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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_address: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      chats: {
        Row: {
          chat_name: string
          child_id: string
          created_at: string | null
          id: string
          import_id: string | null
          is_group: boolean | null
          is_watchlisted: boolean | null
          last_message_at: string | null
          participant_count: number | null
        }
        Insert: {
          chat_name: string
          child_id: string
          created_at?: string | null
          id?: string
          import_id?: string | null
          is_group?: boolean | null
          is_watchlisted?: boolean | null
          last_message_at?: string | null
          participant_count?: number | null
        }
        Update: {
          chat_name?: string
          child_id?: string
          created_at?: string | null
          id?: string
          import_id?: string | null
          is_group?: boolean | null
          is_watchlisted?: boolean | null
          last_message_at?: string | null
          participant_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "chats_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chats_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "imports"
            referencedColumns: ["id"]
          },
        ]
      }
      children: {
        Row: {
          age_range: string | null
          avatar_url: string | null
          consent_ack_at: string | null
          created_at: string | null
          display_name: string
          id: string
          monitoring_enabled: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          age_range?: string | null
          avatar_url?: string | null
          consent_ack_at?: string | null
          created_at?: string | null
          display_name: string
          id?: string
          monitoring_enabled?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          age_range?: string | null
          avatar_url?: string | null
          consent_ack_at?: string | null
          created_at?: string | null
          display_name?: string
          id?: string
          monitoring_enabled?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      connector_credentials: {
        Row: {
          created_at: string | null
          data_source_id: string
          id: string
          instance_id: string | null
          last_checked_at: string | null
          token_encrypted: string | null
        }
        Insert: {
          created_at?: string | null
          data_source_id: string
          id?: string
          instance_id?: string | null
          last_checked_at?: string | null
          token_encrypted?: string | null
        }
        Update: {
          created_at?: string | null
          data_source_id?: string
          id?: string
          instance_id?: string | null
          last_checked_at?: string | null
          token_encrypted?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "connector_credentials_data_source_id_fkey"
            columns: ["data_source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      data_sources: {
        Row: {
          child_id: string
          created_at: string | null
          id: string
          source_type: string
          status: string | null
        }
        Insert: {
          child_id: string
          created_at?: string | null
          id?: string
          source_type: string
          status?: string | null
        }
        Update: {
          child_id?: string
          created_at?: string | null
          id?: string
          source_type?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "data_sources_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence_items: {
        Row: {
          confidence: number | null
          created_at: string | null
          evidence_type: string
          finding_id: string
          id: string
          message_id: string | null
          preview_media_url: string | null
          preview_text: string | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string | null
          evidence_type: string
          finding_id: string
          id?: string
          message_id?: string | null
          preview_media_url?: string | null
          preview_text?: string | null
        }
        Update: {
          confidence?: number | null
          created_at?: string | null
          evidence_type?: string
          finding_id?: string
          id?: string
          message_id?: string | null
          preview_media_url?: string | null
          preview_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evidence_items_finding_id_fkey"
            columns: ["finding_id"]
            isOneToOne: false
            referencedRelation: "findings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_items_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      findings: {
        Row: {
          ai_response_encrypted: Json | null
          child_id: string
          created_at: string | null
          explanation: string | null
          id: string
          risk_level: string | null
          scan_id: string
          threat_detected: boolean
          threat_types: Json | null
        }
        Insert: {
          ai_response_encrypted?: Json | null
          child_id: string
          created_at?: string | null
          explanation?: string | null
          id?: string
          risk_level?: string | null
          scan_id: string
          threat_detected?: boolean
          threat_types?: Json | null
        }
        Update: {
          ai_response_encrypted?: Json | null
          child_id?: string
          created_at?: string | null
          explanation?: string | null
          id?: string
          risk_level?: string | null
          scan_id?: string
          threat_detected?: boolean
          threat_types?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "findings_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "findings_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "scans"
            referencedColumns: ["id"]
          },
        ]
      }
      forum_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      imports: {
        Row: {
          chats_count: number | null
          child_id: string
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          file_size: number | null
          filename: string
          id: string
          media_count: number | null
          messages_count: number | null
          status: string | null
        }
        Insert: {
          chats_count?: number | null
          child_id: string
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          file_size?: number | null
          filename: string
          id?: string
          media_count?: number | null
          messages_count?: number | null
          status?: string | null
        }
        Update: {
          chats_count?: number | null
          child_id?: string
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          file_size?: number | null
          filename?: string
          id?: string
          media_count?: number | null
          messages_count?: number | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "imports_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          chat_id: string
          child_id: string
          created_at: string | null
          id: string
          is_child_sender: boolean | null
          media_thumbnail_url: string | null
          media_url: string | null
          message_timestamp: string
          msg_type: string
          sender_label: string
          text_content: string | null
          text_excerpt: string | null
        }
        Insert: {
          chat_id: string
          child_id: string
          created_at?: string | null
          id?: string
          is_child_sender?: boolean | null
          media_thumbnail_url?: string | null
          media_url?: string | null
          message_timestamp: string
          msg_type: string
          sender_label: string
          text_content?: string | null
          text_excerpt?: string | null
        }
        Update: {
          chat_id?: string
          child_id?: string
          created_at?: string | null
          id?: string
          is_child_sender?: boolean | null
          media_thumbnail_url?: string | null
          media_url?: string | null
          message_timestamp?: string
          msg_type?: string
          sender_label?: string
          text_content?: string | null
          text_excerpt?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_settings: {
        Row: {
          created_at: string | null
          email_enabled: boolean | null
          id: string
          min_risk_level: string | null
          updated_at: string | null
          user_id: string
          weekly_digest_enabled: boolean | null
        }
        Insert: {
          created_at?: string | null
          email_enabled?: boolean | null
          id?: string
          min_risk_level?: string | null
          updated_at?: string | null
          user_id: string
          weekly_digest_enabled?: boolean | null
        }
        Update: {
          created_at?: string | null
          email_enabled?: boolean | null
          id?: string
          min_risk_level?: string | null
          updated_at?: string | null
          user_id?: string
          weekly_digest_enabled?: boolean | null
        }
        Relationships: []
      }
      patterns: {
        Row: {
          chat_id: string
          confidence: number | null
          created_at: string | null
          description: string | null
          id: string
          pattern_type: string
          scan_id: string
        }
        Insert: {
          chat_id: string
          confidence?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          pattern_type: string
          scan_id: string
        }
        Update: {
          chat_id?: string
          confidence?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          pattern_type?: string
          scan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "patterns_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patterns_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "scans"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      scans: {
        Row: {
          child_id: string
          created_at: string | null
          duration_seconds: number | null
          finished_at: string | null
          id: string
          lookback_window: string
          messages_analyzed: number | null
          started_at: string | null
          status: string | null
          summary_json: Json | null
        }
        Insert: {
          child_id: string
          created_at?: string | null
          duration_seconds?: number | null
          finished_at?: string | null
          id?: string
          lookback_window: string
          messages_analyzed?: number | null
          started_at?: string | null
          status?: string | null
          summary_json?: Json | null
        }
        Update: {
          child_id?: string
          created_at?: string | null
          duration_seconds?: number | null
          finished_at?: string | null
          id?: string
          lookback_window?: string
          messages_analyzed?: number | null
          started_at?: string | null
          status?: string | null
          summary_json?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "scans_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_alerts: {
        Row: {
          child_id: string
          created_at: string
          finding_id: string | null
          id: string
          parent_message: string | null
          parent_user_id: string
          responded_at: string | null
          status: string
          teacher_email: string
          teacher_name: string | null
          teacher_response: string | null
          updated_at: string
        }
        Insert: {
          child_id: string
          created_at?: string
          finding_id?: string | null
          id?: string
          parent_message?: string | null
          parent_user_id: string
          responded_at?: string | null
          status?: string
          teacher_email: string
          teacher_name?: string | null
          teacher_response?: string | null
          updated_at?: string
        }
        Update: {
          child_id?: string
          created_at?: string
          finding_id?: string | null
          id?: string
          parent_message?: string | null
          parent_user_id?: string
          responded_at?: string | null
          status?: string
          teacher_email?: string
          teacher_name?: string | null
          teacher_response?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_alerts_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_alerts_finding_id_fkey"
            columns: ["finding_id"]
            isOneToOne: false
            referencedRelation: "findings"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
