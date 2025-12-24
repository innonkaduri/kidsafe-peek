-- Add handled column to findings table
ALTER TABLE public.findings 
ADD COLUMN handled boolean DEFAULT false,
ADD COLUMN handled_at timestamp with time zone DEFAULT NULL;

-- Add UPDATE policy for findings so users can mark them as handled
CREATE POLICY "Users can update own findings"
ON public.findings
FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM children
  WHERE children.id = findings.child_id AND children.user_id = auth.uid()
));