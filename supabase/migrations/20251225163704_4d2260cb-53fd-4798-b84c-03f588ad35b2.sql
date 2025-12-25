-- Remove old CHECK CONSTRAINT
ALTER TABLE public.scans DROP CONSTRAINT IF EXISTS scans_lookback_window_check;

-- Add new CHECK CONSTRAINT that includes 'since_last_scan'
ALTER TABLE public.scans ADD CONSTRAINT scans_lookback_window_check 
CHECK (lookback_window = ANY (ARRAY['24h'::text, '7d'::text, '30d'::text, 'since_last_scan'::text, 'all'::text]));