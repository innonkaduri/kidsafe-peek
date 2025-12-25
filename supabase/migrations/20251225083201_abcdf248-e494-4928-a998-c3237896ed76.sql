-- Update connector_credentials table for multi-instance support
ALTER TABLE public.connector_credentials 
ADD COLUMN IF NOT EXISTS api_token TEXT,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS child_id UUID REFERENCES public.children(id) ON DELETE CASCADE;

-- Create index for faster lookups by child_id
CREATE INDEX IF NOT EXISTS idx_connector_credentials_child_id ON public.connector_credentials(child_id);

-- Create index for faster lookups by status
CREATE INDEX IF NOT EXISTS idx_connector_credentials_status ON public.connector_credentials(status);