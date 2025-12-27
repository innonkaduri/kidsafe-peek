-- Add image_caption and image_flags to messages table
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS image_caption TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS image_flags TEXT[];

-- Create small_signals table for Small Agent results
CREATE TABLE public.small_signals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  risk_score INTEGER NOT NULL CHECK (risk_score >= 0 AND risk_score <= 100),
  risk_codes TEXT[] DEFAULT '{}',
  escalate BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create scan_checkpoints table to track scanning progress
CREATE TABLE public.scan_checkpoints (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE UNIQUE,
  last_scanned_at TIMESTAMPTZ,
  last_smart_at TIMESTAMPTZ,
  pending_batch_ids UUID[] DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create smart_decisions table for Smart Agent results
CREATE TABLE public.smart_decisions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  timeframe_from TIMESTAMPTZ NOT NULL,
  timeframe_to TIMESTAMPTZ NOT NULL,
  final_risk_score INTEGER NOT NULL CHECK (final_risk_score >= 0 AND final_risk_score <= 100),
  threat_type TEXT CHECK (threat_type IN ('grooming', 'sexual_content', 'violence', 'extortion', 'manipulation', 'none')),
  confidence DECIMAL(3,2) CHECK (confidence >= 0 AND confidence <= 1),
  action TEXT NOT NULL CHECK (action IN ('ignore', 'monitor', 'alert')),
  key_reasons TEXT[] DEFAULT '{}',
  evidence_message_ids UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create model_logs table for tracking AI usage
CREATE TABLE public.model_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  function_name TEXT NOT NULL,
  model TEXT NOT NULL,
  request_tokens INTEGER,
  response_tokens INTEGER,
  latency_ms INTEGER,
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  child_id UUID REFERENCES public.children(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add smart_decision_id to findings table (alerts link)
ALTER TABLE public.findings ADD COLUMN IF NOT EXISTS smart_decision_id UUID REFERENCES public.smart_decisions(id) ON DELETE SET NULL;

-- Enable RLS on new tables
ALTER TABLE public.small_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smart_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for small_signals
CREATE POLICY "Users can view own small_signals" ON public.small_signals
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.children c ON m.child_id = c.id
      WHERE m.id = small_signals.message_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own small_signals" ON public.small_signals
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.children c ON m.child_id = c.id
      WHERE m.id = small_signals.message_id AND c.user_id = auth.uid()
    )
  );

-- RLS policies for scan_checkpoints
CREATE POLICY "Users can view own scan_checkpoints" ON public.scan_checkpoints
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.chats ch
      JOIN public.children c ON ch.child_id = c.id
      WHERE ch.id = scan_checkpoints.chat_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage own scan_checkpoints" ON public.scan_checkpoints
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.chats ch
      JOIN public.children c ON ch.child_id = c.id
      WHERE ch.id = scan_checkpoints.chat_id AND c.user_id = auth.uid()
    )
  );

-- RLS policies for smart_decisions
CREATE POLICY "Users can view own smart_decisions" ON public.smart_decisions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.children c
      WHERE c.id = smart_decisions.child_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own smart_decisions" ON public.smart_decisions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.children c
      WHERE c.id = smart_decisions.child_id AND c.user_id = auth.uid()
    )
  );

-- RLS policies for model_logs (users can view their own logs)
CREATE POLICY "Users can view own model_logs" ON public.model_logs
  FOR SELECT USING (
    child_id IS NULL OR EXISTS (
      SELECT 1 FROM public.children c
      WHERE c.id = model_logs.child_id AND c.user_id = auth.uid()
    )
  );

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_small_signals_message_id ON public.small_signals(message_id);
CREATE INDEX IF NOT EXISTS idx_small_signals_risk_score ON public.small_signals(risk_score);
CREATE INDEX IF NOT EXISTS idx_small_signals_created_at ON public.small_signals(created_at);
CREATE INDEX IF NOT EXISTS idx_scan_checkpoints_chat_id ON public.scan_checkpoints(chat_id);
CREATE INDEX IF NOT EXISTS idx_smart_decisions_chat_id ON public.smart_decisions(chat_id);
CREATE INDEX IF NOT EXISTS idx_smart_decisions_child_id ON public.smart_decisions(child_id);
CREATE INDEX IF NOT EXISTS idx_smart_decisions_action ON public.smart_decisions(action);
CREATE INDEX IF NOT EXISTS idx_model_logs_function_name ON public.model_logs(function_name);
CREATE INDEX IF NOT EXISTS idx_model_logs_child_id ON public.model_logs(child_id);