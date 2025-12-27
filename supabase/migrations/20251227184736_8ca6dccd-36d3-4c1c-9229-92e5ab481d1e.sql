-- 1. Create usage_meter table for budget tracking
CREATE TABLE public.usage_meter (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id UUID NOT NULL,
  month_yyyy_mm TEXT NOT NULL,
  est_cost_usd DECIMAL(10,4) DEFAULT 0,
  small_calls INTEGER DEFAULT 0,
  smart_calls INTEGER DEFAULT 0,
  fallback_calls INTEGER DEFAULT 0,
  image_caption_calls INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(child_id, month_yyyy_mm)
);

-- 2. Enable RLS on usage_meter
ALTER TABLE public.usage_meter ENABLE ROW LEVEL SECURITY;

-- 3. RLS policies for usage_meter
CREATE POLICY "Users can view own usage_meter"
ON public.usage_meter FOR SELECT
USING (EXISTS (
  SELECT 1 FROM children 
  WHERE children.id = usage_meter.child_id 
  AND children.user_id = auth.uid()
));

CREATE POLICY "Users can insert own usage_meter"
ON public.usage_meter FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM children 
  WHERE children.id = usage_meter.child_id 
  AND children.user_id = auth.uid()
));

CREATE POLICY "Users can update own usage_meter"
ON public.usage_meter FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM children 
  WHERE children.id = usage_meter.child_id 
  AND children.user_id = auth.uid()
));

-- 4. Add new columns to findings table
ALTER TABLE public.findings 
  ADD COLUMN IF NOT EXISTS acknowledged BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS severity TEXT DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS conversation_id UUID;

-- 5. Add new columns to scan_checkpoints table
ALTER TABLE public.scan_checkpoints 
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scan_interval_minutes INTEGER DEFAULT 10;

-- 6. Create trigger for usage_meter updated_at
CREATE TRIGGER update_usage_meter_updated_at
BEFORE UPDATE ON public.usage_meter
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();