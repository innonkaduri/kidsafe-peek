-- Create a messaging table for parent-teacher communication
CREATE TABLE public.teacher_alert_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  alert_id UUID NOT NULL REFERENCES public.teacher_alerts(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('parent', 'teacher')),
  sender_user_id UUID NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  read_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.teacher_alert_messages ENABLE ROW LEVEL SECURITY;

-- Parents can view and insert messages on their own alerts
CREATE POLICY "Parents can view messages on their alerts"
  ON public.teacher_alert_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.teacher_alerts ta
      WHERE ta.id = alert_id AND ta.parent_user_id = auth.uid()
    )
  );

CREATE POLICY "Parents can insert messages on their alerts"
  ON public.teacher_alert_messages
  FOR INSERT
  WITH CHECK (
    sender_type = 'parent' AND
    sender_user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.teacher_alerts ta
      WHERE ta.id = alert_id AND ta.parent_user_id = auth.uid()
    )
  );

-- Teachers can view and insert messages on alerts sent to their email
CREATE POLICY "Teachers can view messages on their alerts"
  ON public.teacher_alert_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.teacher_alerts ta
      WHERE ta.id = alert_id AND ta.teacher_email = (
        SELECT email FROM auth.users WHERE id = auth.uid()
      )::text
    )
  );

CREATE POLICY "Teachers can insert messages on their alerts"
  ON public.teacher_alert_messages
  FOR INSERT
  WITH CHECK (
    sender_type = 'teacher' AND
    sender_user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.teacher_alerts ta
      WHERE ta.id = alert_id AND ta.teacher_email = (
        SELECT email FROM auth.users WHERE id = auth.uid()
      )::text
    )
  );

-- Allow updating read_at for marking messages as read
CREATE POLICY "Users can mark messages as read"
  ON public.teacher_alert_messages
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.teacher_alerts ta
      WHERE ta.id = alert_id AND (
        ta.parent_user_id = auth.uid() OR
        ta.teacher_email = (SELECT email FROM auth.users WHERE id = auth.uid())::text
      )
    )
  );

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.teacher_alert_messages;