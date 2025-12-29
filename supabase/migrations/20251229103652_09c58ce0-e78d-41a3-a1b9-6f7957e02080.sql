-- Step 1: Create Security Definer function to get current user's email
CREATE OR REPLACE FUNCTION public.get_current_user_email()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email FROM auth.users WHERE id = auth.uid()
$$;

-- Step 2: Drop and recreate all 6 policies that use auth.users

-- Policy 1: children - Teachers can view children for their alerts
DROP POLICY IF EXISTS "Teachers can view children for their alerts" ON public.children;
CREATE POLICY "Teachers can view children for their alerts" 
ON public.children 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1
    FROM teacher_alerts ta
    WHERE ta.child_id = children.id 
    AND ta.teacher_email = public.get_current_user_email()
  )
);

-- Policy 2: teacher_alerts - Teachers can view alerts sent to their email
DROP POLICY IF EXISTS "Teachers can view alerts sent to their email" ON public.teacher_alerts;
CREATE POLICY "Teachers can view alerts sent to their email" 
ON public.teacher_alerts 
FOR SELECT 
USING (teacher_email = public.get_current_user_email());

-- Policy 3: teacher_alerts - Teachers can update alerts sent to their email
DROP POLICY IF EXISTS "Teachers can update alerts sent to their email" ON public.teacher_alerts;
CREATE POLICY "Teachers can update alerts sent to their email" 
ON public.teacher_alerts 
FOR UPDATE 
USING (teacher_email = public.get_current_user_email());

-- Policy 4: teacher_alert_messages - Teachers can view messages on their alerts
DROP POLICY IF EXISTS "Teachers can view messages on their alerts" ON public.teacher_alert_messages;
CREATE POLICY "Teachers can view messages on their alerts" 
ON public.teacher_alert_messages 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1
    FROM teacher_alerts ta
    WHERE ta.id = teacher_alert_messages.alert_id 
    AND ta.teacher_email = public.get_current_user_email()
  )
);

-- Policy 5: teacher_alert_messages - Teachers can insert messages on their alerts
DROP POLICY IF EXISTS "Teachers can insert messages on their alerts" ON public.teacher_alert_messages;
CREATE POLICY "Teachers can insert messages on their alerts" 
ON public.teacher_alert_messages 
FOR INSERT 
WITH CHECK (
  sender_type = 'teacher' 
  AND sender_user_id = auth.uid() 
  AND EXISTS (
    SELECT 1
    FROM teacher_alerts ta
    WHERE ta.id = teacher_alert_messages.alert_id 
    AND ta.teacher_email = public.get_current_user_email()
  )
);

-- Policy 6: teacher_alert_messages - Users can mark messages as read
DROP POLICY IF EXISTS "Users can mark messages as read" ON public.teacher_alert_messages;
CREATE POLICY "Users can mark messages as read" 
ON public.teacher_alert_messages 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1
    FROM teacher_alerts ta
    WHERE ta.id = teacher_alert_messages.alert_id 
    AND (
      ta.parent_user_id = auth.uid() 
      OR ta.teacher_email = public.get_current_user_email()
    )
  )
);