-- Add new columns to teacher_alerts for full ticketing system
ALTER TABLE public.teacher_alerts 
ADD COLUMN IF NOT EXISTS severity text DEFAULT 'medium',
ADD COLUMN IF NOT EXISTS category text,
ADD COLUMN IF NOT EXISTS action_taken text,
ADD COLUMN IF NOT EXISTS internal_notes text,
ADD COLUMN IF NOT EXISTS timeline jsonb DEFAULT '[]'::jsonb;

-- Create function to get user roles
CREATE OR REPLACE FUNCTION public.get_user_roles(_user_id uuid)
RETURNS app_role[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(role), '{}')
  FROM public.user_roles
  WHERE user_id = _user_id
$$;

-- Update trigger to assign default parent role to new users
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Default new users get parent role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'parent');
  RETURN NEW;
END;
$$;

-- Create trigger if not exists
DROP TRIGGER IF EXISTS on_auth_user_created_role ON auth.users;
CREATE TRIGGER on_auth_user_created_role
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_role();

-- Add RLS policy for teachers to view alerts sent to their email
DROP POLICY IF EXISTS "Teachers can view alerts sent to their email" ON public.teacher_alerts;
CREATE POLICY "Teachers can view alerts sent to their email"
ON public.teacher_alerts
FOR SELECT
USING (teacher_email = (SELECT email FROM auth.users WHERE id = auth.uid())::text);

-- Add RLS policy for teachers to update alerts sent to their email
DROP POLICY IF EXISTS "Teachers can update alerts sent to their email" ON public.teacher_alerts;
CREATE POLICY "Teachers can update alerts sent to their email"
ON public.teacher_alerts
FOR UPDATE
USING (teacher_email = (SELECT email FROM auth.users WHERE id = auth.uid())::text);

-- Add index for faster teacher email lookups
CREATE INDEX IF NOT EXISTS idx_teacher_alerts_teacher_email ON public.teacher_alerts(teacher_email);

-- Add index for faster status filtering
CREATE INDEX IF NOT EXISTS idx_teacher_alerts_status ON public.teacher_alerts(status);