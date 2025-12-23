export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type ThreatType = 
  | 'harassment_bullying'
  | 'coercion_pressure'
  | 'extortion_blackmail'
  | 'adult_inappropriate'
  | 'scams_fraud'
  | 'violence_threats';

export type LookbackWindow = '24h' | '7d' | '30d';
export type AgeRange = '6-9' | '10-12' | '13-15' | '16-18';
export type MessageType = 'text' | 'image' | 'audio' | 'video' | 'file';
export type ScanStatus = 'pending' | 'running' | 'completed' | 'failed';
export type ImportStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface Child {
  id: string;
  user_id: string;
  display_name: string;
  age_range: AgeRange | null;
  avatar_url: string | null;
  consent_ack_at: string | null;
  monitoring_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface Scan {
  id: string;
  child_id: string;
  lookback_window: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  duration_seconds: number | null;
  messages_analyzed: number;
  summary_json: any;
  created_at: string;
}

export interface Finding {
  id: string;
  scan_id: string;
  child_id: string;
  threat_detected: boolean;
  risk_level: string | null;
  threat_types: any;
  explanation: string | null;
  created_at: string;
}

export interface Pattern {
  id: string;
  scan_id: string;
  chat_id: string;
  pattern_type: string;
  description: string | null;
  confidence: number | null;
  created_at: string;
}

export interface Chat {
  id: string;
  child_id: string;
  import_id: string | null;
  chat_name: string;
  participant_count: number;
  is_group: boolean;
  is_watchlisted: boolean;
  last_message_at: string | null;
  created_at: string;
}

export interface Message {
  id: string;
  child_id: string;
  chat_id: string;
  sender_label: string;
  is_child_sender: boolean;
  msg_type: MessageType;
  message_timestamp: string;
  text_content: string | null;
  text_excerpt: string | null;
  media_url: string | null;
  media_thumbnail_url: string | null;
  created_at: string;
}

export interface Import {
  id: string;
  child_id: string;
  filename: string;
  file_size: number | null;
  status: ImportStatus;
  chats_count: number;
  messages_count: number;
  media_count: number;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}
