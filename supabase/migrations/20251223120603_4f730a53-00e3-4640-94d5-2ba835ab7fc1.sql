-- Create forum_messages table for parents forum
CREATE TABLE public.forum_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.forum_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all forum messages"
  ON public.forum_messages
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can insert own forum messages"
  ON public.forum_messages
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own forum messages"
  ON public.forum_messages
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own forum messages"
  ON public.forum_messages
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create teacher_alerts table for sharing alerts with teachers
CREATE TABLE public.teacher_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  parent_user_id UUID NOT NULL,
  finding_id UUID REFERENCES public.findings(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  teacher_email TEXT NOT NULL,
  teacher_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  parent_message TEXT,
  teacher_response TEXT,
  responded_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.teacher_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parents can view own teacher alerts"
  ON public.teacher_alerts
  FOR SELECT
  USING (auth.uid() = parent_user_id);

CREATE POLICY "Parents can insert own teacher alerts"
  ON public.teacher_alerts
  FOR INSERT
  WITH CHECK (auth.uid() = parent_user_id);

CREATE POLICY "Parents can update own teacher alerts"
  ON public.teacher_alerts
  FOR UPDATE
  USING (auth.uid() = parent_user_id);

-- Add updated_at trigger for both tables
CREATE TRIGGER update_forum_messages_updated_at
  BEFORE UPDATE ON public.forum_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_teacher_alerts_updated_at
  BEFORE UPDATE ON public.teacher_alerts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();