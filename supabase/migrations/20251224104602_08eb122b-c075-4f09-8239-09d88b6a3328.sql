-- Add teacher_email column to children table for default teacher contact
ALTER TABLE public.children 
ADD COLUMN teacher_email text DEFAULT NULL;

-- Add a comment to explain the column's purpose
COMMENT ON COLUMN public.children.teacher_email IS 'Default teacher email to send alerts to when parent shares findings';