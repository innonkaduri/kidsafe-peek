-- Update check constraint to allow 'auto' value
ALTER TABLE public.scans DROP CONSTRAINT IF EXISTS scans_lookback_window_check;
ALTER TABLE public.scans ADD CONSTRAINT scans_lookback_window_check 
CHECK (lookback_window = ANY (ARRAY['24h', '7d', '30d', 'since_last_scan', 'all', 'auto']::text[]));