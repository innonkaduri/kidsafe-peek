-- Add RLS policy to allow teachers to view minimal child info for alerts they received
CREATE POLICY "Teachers can view children for their alerts"
ON public.children
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM teacher_alerts ta
    WHERE ta.child_id = children.id
    AND ta.teacher_email = (SELECT email FROM auth.users WHERE id = auth.uid())
  )
);