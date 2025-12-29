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
          teacher_email: string | null
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
          teacher_email?: string | null
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
          teacher_email?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      connector_credentials: {
        Row: {
          api_token: string | null
          child_id: string | null
          created_at: string | null
          data_source_id: string
          id: string
          instance_id: string | null
          last_checked_at: string | null
          status: string | null
          token_encrypted: string | null
        }
        Insert: {
          api_token?: string | null
          child_id?: string | null
          created_at?: string | null
          data_source_id: string
          id?: string
          instance_id?: string | null
          last_checked_at?: string | null
          status?: string | null
          token_encrypted?: string | null
        }
        Update: {
          api_token?: string | null
          child_id?: string | null
          created_at?: string | null
          data_source_id?: string
          id?: string
          instance_id?: string | null
          last_checked_at?: string | null
          status?: string | null
          token_encrypted?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "connector_credentials_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
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
          acknowledged: boolean | null
          acknowledged_at: string | null
          ai_response_encrypted: Json | null
          child_id: string
          conversation_id: string | null
          created_at: string | null
          explanation: string | null
          handled: boolean | null
          handled_at: string | null
          id: string
          risk_level: string | null
          scan_id: string
          severity: string | null
          smart_decision_id: string | null
          threat_detected: boolean
          threat_types: Json | null
        }
        Insert: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          ai_response_encrypted?: Json | null
          child_id: string
          conversation_id?: string | null
          created_at?: string | null
          explanation?: string | null
          handled?: boolean | null
          handled_at?: string | null
          id?: string
          risk_level?: string | null
          scan_id: string
          severity?: string | null
          smart_decision_id?: string | null
          threat_detected?: boolean
          threat_types?: Json | null
        }
        Update: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          ai_response_encrypted?: Json | null
          child_id?: string
          conversation_id?: string | null
          created_at?: string | null
          explanation?: string | null
          handled?: boolean | null
          handled_at?: string | null
          id?: string
          risk_level?: string | null
          scan_id?: string
          severity?: string | null
          smart_decision_id?: string | null
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
          {
            foreignKeyName: "findings_smart_decision_id_fkey"
            columns: ["smart_decision_id"]
            isOneToOne: false
            referencedRelation: "smart_decisions"
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
          image_caption: string | null
          image_flags: string[] | null
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
          image_caption?: string | null
          image_flags?: string[] | null
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
          image_caption?: string | null
          image_flags?: string[] | null
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
      model_logs: {
        Row: {
          child_id: string | null
          created_at: string | null
          error_message: string | null
          function_name: string
          id: string
          latency_ms: number | null
          model: string
          request_tokens: number | null
          response_tokens: number | null
          success: boolean | null
        }
        Insert: {
          child_id?: string | null
          created_at?: string | null
          error_message?: string | null
          function_name: string
          id?: string
          latency_ms?: number | null
          model: string
          request_tokens?: number | null
          response_tokens?: number | null
          success?: boolean | null
        }
        Update: {
          child_id?: string | null
          created_at?: string | null
          error_message?: string | null
          function_name?: string
          id?: string
          latency_ms?: number | null
          model?: string
          request_tokens?: number | null
          response_tokens?: number | null
          success?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "model_logs_child_id_fkey"
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
      scan_checkpoints: {
        Row: {
          chat_id: string
          id: string
          last_activity_at: string | null
          last_scanned_at: string | null
          last_smart_at: string | null
          pending_batch_ids: string[] | null
          scan_interval_minutes: number | null
          updated_at: string | null
        }
        Insert: {
          chat_id: string
          id?: string
          last_activity_at?: string | null
          last_scanned_at?: string | null
          last_smart_at?: string | null
          pending_batch_ids?: string[] | null
          scan_interval_minutes?: number | null
          updated_at?: string | null
        }
        Update: {
          chat_id?: string
          id?: string
          last_activity_at?: string | null
          last_scanned_at?: string | null
          last_smart_at?: string | null
          pending_batch_ids?: string[] | null
          scan_interval_minutes?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scan_checkpoints_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: true
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
        ]
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
      small_signals: {
        Row: {
          created_at: string | null
          escalate: boolean | null
          id: string
          message_id: string
          risk_codes: string[] | null
          risk_score: number
        }
        Insert: {
          created_at?: string | null
          escalate?: boolean | null
          id?: string
          message_id: string
          risk_codes?: string[] | null
          risk_score: number
        }
        Update: {
          created_at?: string | null
          escalate?: boolean | null
          id?: string
          message_id?: string
          risk_codes?: string[] | null
          risk_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "small_signals_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      smart_decisions: {
        Row: {
          action: string
          chat_id: string
          child_id: string
          confidence: number | null
          created_at: string | null
          evidence_message_ids: string[] | null
          final_risk_score: number
          id: string
          key_reasons: string[] | null
          threat_type: string | null
          timeframe_from: string
          timeframe_to: string
        }
        Insert: {
          action: string
          chat_id: string
          child_id: string
          confidence?: number | null
          created_at?: string | null
          evidence_message_ids?: string[] | null
          final_risk_score: number
          id?: string
          key_reasons?: string[] | null
          threat_type?: string | null
          timeframe_from: string
          timeframe_to: string
        }
        Update: {
          action?: string
          chat_id?: string
          child_id?: string
          confidence?: number | null
          created_at?: string | null
          evidence_message_ids?: string[] | null
          final_risk_score?: number
          id?: string
          key_reasons?: string[] | null
          threat_type?: string | null
          timeframe_from?: string
          timeframe_to?: string
        }
        Relationships: [
          {
            foreignKeyName: "smart_decisions_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "smart_decisions_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_alert_messages: {
        Row: {
          alert_id: string
          created_at: string
          id: string
          message: string
          read_at: string | null
          sender_type: string
          sender_user_id: string
        }
        Insert: {
          alert_id: string
          created_at?: string
          id?: string
          message: string
          read_at?: string | null
          sender_type: string
          sender_user_id: string
        }
        Update: {
          alert_id?: string
          created_at?: string
          id?: string
          message?: string
          read_at?: string | null
          sender_type?: string
          sender_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_alert_messages_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "teacher_alerts"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_alerts: {
        Row: {
          action_taken: string | null
          category: string | null
          child_id: string
          created_at: string
          finding_id: string | null
          id: string
          internal_notes: string | null
          parent_message: string | null
          parent_user_id: string
          responded_at: string | null
          severity: string | null
          status: string
          teacher_email: string
          teacher_name: string | null
          teacher_response: string | null
          timeline: Json | null
          updated_at: string
        }
        Insert: {
          action_taken?: string | null
          category?: string | null
          child_id: string
          created_at?: string
          finding_id?: string | null
          id?: string
          internal_notes?: string | null
          parent_message?: string | null
          parent_user_id: string
          responded_at?: string | null
          severity?: string | null
          status?: string
          teacher_email: string
          teacher_name?: string | null
          teacher_response?: string | null
          timeline?: Json | null
          updated_at?: string
        }
        Update: {
          action_taken?: string | null
          category?: string | null
          child_id?: string
          created_at?: string
          finding_id?: string | null
          id?: string
          internal_notes?: string | null
          parent_message?: string | null
          parent_user_id?: string
          responded_at?: string | null
          severity?: string | null
          status?: string
          teacher_email?: string
          teacher_name?: string | null
          teacher_response?: string | null
          timeline?: Json | null
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
      usage_meter: {
        Row: {
          child_id: string
          created_at: string | null
          est_cost_usd: number | null
          fallback_calls: number | null
          id: string
          image_caption_calls: number | null
          month_yyyy_mm: string
          small_calls: number | null
          smart_calls: number | null
          updated_at: string | null
        }
        Insert: {
          child_id: string
          created_at?: string | null
          est_cost_usd?: number | null
          fallback_calls?: number | null
          id?: string
          image_caption_calls?: number | null
          month_yyyy_mm: string
          small_calls?: number | null
          smart_calls?: number | null
          updated_at?: string | null
        }
        Update: {
          child_id?: string
          created_at?: string | null
          est_cost_usd?: number | null
          fallback_calls?: number | null
          id?: string
          image_caption_calls?: number | null
          month_yyyy_mm?: string
          small_calls?: number | null
          smart_calls?: number | null
          updated_at?: string | null
        }
        Relationships: []
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_current_user_email: { Args: never; Returns: string }
      get_user_roles: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"][]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "parent" | "teacher" | "admin"
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
      app_role: ["parent", "teacher", "admin"],
    },
  },
} as const
