-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create profiles table linked to auth.users
CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create children table
CREATE TABLE public.children (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  age_range TEXT CHECK (age_range IN ('6-9', '10-12', '13-15', '16-18')),
  avatar_url TEXT,
  consent_ack_at TIMESTAMP WITH TIME ZONE,
  monitoring_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create data_sources table
CREATE TABLE public.data_sources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('manual_import', 'connector')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create connector_credentials table
CREATE TABLE public.connector_credentials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  data_source_id UUID NOT NULL REFERENCES public.data_sources(id) ON DELETE CASCADE,
  instance_id TEXT,
  token_encrypted TEXT,
  last_checked_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create imports table
CREATE TABLE public.imports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  file_size BIGINT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  chats_count INTEGER DEFAULT 0,
  messages_count INTEGER DEFAULT 0,
  media_count INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Create scans table
CREATE TABLE public.scans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  lookback_window TEXT NOT NULL CHECK (lookback_window IN ('24h', '7d', '30d')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  started_at TIMESTAMP WITH TIME ZONE,
  finished_at TIMESTAMP WITH TIME ZONE,
  duration_seconds INTEGER,
  messages_analyzed INTEGER DEFAULT 0,
  summary_json JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create chats table
CREATE TABLE public.chats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  import_id UUID REFERENCES public.imports(id) ON DELETE SET NULL,
  chat_name TEXT NOT NULL,
  participant_count INTEGER DEFAULT 2,
  is_group BOOLEAN DEFAULT false,
  is_watchlisted BOOLEAN DEFAULT false,
  last_message_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create messages table
CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  sender_label TEXT NOT NULL,
  is_child_sender BOOLEAN DEFAULT false,
  msg_type TEXT NOT NULL CHECK (msg_type IN ('text', 'image', 'audio', 'video', 'file')),
  message_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  text_content TEXT,
  text_excerpt TEXT,
  media_url TEXT,
  media_thumbnail_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create findings table
CREATE TABLE public.findings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scan_id UUID NOT NULL REFERENCES public.scans(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  threat_detected BOOLEAN NOT NULL DEFAULT false,
  risk_level TEXT CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  threat_types JSONB DEFAULT '[]'::jsonb,
  explanation TEXT,
  ai_response_encrypted JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create evidence_items table
CREATE TABLE public.evidence_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  finding_id UUID NOT NULL REFERENCES public.findings(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  evidence_type TEXT NOT NULL CHECK (evidence_type IN ('text', 'image', 'audio')),
  preview_text TEXT,
  preview_media_url TEXT,
  confidence DECIMAL(3,2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create patterns table
CREATE TABLE public.patterns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scan_id UUID NOT NULL REFERENCES public.scans(id) ON DELETE CASCADE,
  chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  pattern_type TEXT NOT NULL,
  description TEXT,
  confidence DECIMAL(3,2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create audit_logs table
CREATE TABLE public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  ip_address TEXT,
  user_agent TEXT,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create notification_settings table
CREATE TABLE public.notification_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email_enabled BOOLEAN DEFAULT true,
  min_risk_level TEXT DEFAULT 'high' CHECK (min_risk_level IN ('low', 'medium', 'high', 'critical')),
  weekly_digest_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.children ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connector_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Children policies
CREATE POLICY "Users can view own children" ON public.children
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own children" ON public.children
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own children" ON public.children
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own children" ON public.children
  FOR DELETE USING (auth.uid() = user_id);

-- Data sources policies (through children ownership)
CREATE POLICY "Users can view own data sources" ON public.data_sources
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.children WHERE children.id = data_sources.child_id AND children.user_id = auth.uid())
  );
CREATE POLICY "Users can insert own data sources" ON public.data_sources
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.children WHERE children.id = data_sources.child_id AND children.user_id = auth.uid())
  );
CREATE POLICY "Users can update own data sources" ON public.data_sources
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.children WHERE children.id = data_sources.child_id AND children.user_id = auth.uid())
  );
CREATE POLICY "Users can delete own data sources" ON public.data_sources
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.children WHERE children.id = data_sources.child_id AND children.user_id = auth.uid())
  );

-- Connector credentials policies
CREATE POLICY "Users can manage own connector credentials" ON public.connector_credentials
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.data_sources ds
      JOIN public.children c ON ds.child_id = c.id
      WHERE ds.id = connector_credentials.data_source_id AND c.user_id = auth.uid()
    )
  );

-- Imports policies
CREATE POLICY "Users can view own imports" ON public.imports
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.children WHERE children.id = imports.child_id AND children.user_id = auth.uid())
  );
CREATE POLICY "Users can insert own imports" ON public.imports
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.children WHERE children.id = imports.child_id AND children.user_id = auth.uid())
  );
CREATE POLICY "Users can update own imports" ON public.imports
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.children WHERE children.id = imports.child_id AND children.user_id = auth.uid())
  );

-- Scans policies
CREATE POLICY "Users can view own scans" ON public.scans
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.children WHERE children.id = scans.child_id AND children.user_id = auth.uid())
  );
CREATE POLICY "Users can insert own scans" ON public.scans
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.children WHERE children.id = scans.child_id AND children.user_id = auth.uid())
  );
CREATE POLICY "Users can update own scans" ON public.scans
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.children WHERE children.id = scans.child_id AND children.user_id = auth.uid())
  );

-- Chats policies
CREATE POLICY "Users can view own chats" ON public.chats
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.children WHERE children.id = chats.child_id AND children.user_id = auth.uid())
  );
CREATE POLICY "Users can insert own chats" ON public.chats
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.children WHERE children.id = chats.child_id AND children.user_id = auth.uid())
  );
CREATE POLICY "Users can update own chats" ON public.chats
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.children WHERE children.id = chats.child_id AND children.user_id = auth.uid())
  );
CREATE POLICY "Users can delete own chats" ON public.chats
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.children WHERE children.id = chats.child_id AND children.user_id = auth.uid())
  );

-- Messages policies
CREATE POLICY "Users can view own messages" ON public.messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.children WHERE children.id = messages.child_id AND children.user_id = auth.uid())
  );
CREATE POLICY "Users can insert own messages" ON public.messages
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.children WHERE children.id = messages.child_id AND children.user_id = auth.uid())
  );
CREATE POLICY "Users can delete own messages" ON public.messages
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.children WHERE children.id = messages.child_id AND children.user_id = auth.uid())
  );

-- Findings policies
CREATE POLICY "Users can view own findings" ON public.findings
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.children WHERE children.id = findings.child_id AND children.user_id = auth.uid())
  );
CREATE POLICY "Users can insert own findings" ON public.findings
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.children WHERE children.id = findings.child_id AND children.user_id = auth.uid())
  );

-- Evidence items policies
CREATE POLICY "Users can view own evidence" ON public.evidence_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.findings f
      JOIN public.children c ON f.child_id = c.id
      WHERE f.id = evidence_items.finding_id AND c.user_id = auth.uid()
    )
  );
CREATE POLICY "Users can insert own evidence" ON public.evidence_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.findings f
      JOIN public.children c ON f.child_id = c.id
      WHERE f.id = evidence_items.finding_id AND c.user_id = auth.uid()
    )
  );

-- Patterns policies
CREATE POLICY "Users can view own patterns" ON public.patterns
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.scans s
      JOIN public.children c ON s.child_id = c.id
      WHERE s.id = patterns.scan_id AND c.user_id = auth.uid()
    )
  );
CREATE POLICY "Users can insert own patterns" ON public.patterns
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.scans s
      JOIN public.children c ON s.child_id = c.id
      WHERE s.id = patterns.scan_id AND c.user_id = auth.uid()
    )
  );

-- Audit logs policies (users can only view their own)
CREATE POLICY "Users can view own audit logs" ON public.audit_logs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own audit logs" ON public.audit_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Notification settings policies
CREATE POLICY "Users can view own notification settings" ON public.notification_settings
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own notification settings" ON public.notification_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own notification settings" ON public.notification_settings
  FOR UPDATE USING (auth.uid() = user_id);

-- Create function to handle new user profile creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  
  INSERT INTO public.notification_settings (user_id)
  VALUES (NEW.id);
  
  RETURN NEW;
END;
$$;

-- Create trigger for new user
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Create triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_children_updated_at
  BEFORE UPDATE ON public.children
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_notification_settings_updated_at
  BEFORE UPDATE ON public.notification_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for performance
CREATE INDEX idx_children_user_id ON public.children(user_id);
CREATE INDEX idx_imports_child_id ON public.imports(child_id);
CREATE INDEX idx_scans_child_id ON public.scans(child_id);
CREATE INDEX idx_chats_child_id ON public.chats(child_id);
CREATE INDEX idx_messages_child_id ON public.messages(child_id);
CREATE INDEX idx_messages_chat_id ON public.messages(chat_id);
CREATE INDEX idx_messages_timestamp ON public.messages(message_timestamp);
CREATE INDEX idx_findings_scan_id ON public.findings(scan_id);
CREATE INDEX idx_findings_child_id ON public.findings(child_id);
CREATE INDEX idx_evidence_items_finding_id ON public.evidence_items(finding_id);
CREATE INDEX idx_patterns_scan_id ON public.patterns(scan_id);
CREATE INDEX idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at);