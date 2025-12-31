-- Add external_chat_id column to chats table for reliable identification
ALTER TABLE public.chats ADD COLUMN IF NOT EXISTS external_chat_id text;

-- Create index for efficient lookups by child_id and external_chat_id
CREATE INDEX IF NOT EXISTS idx_chats_external_chat_id ON public.chats(child_id, external_chat_id);

-- Add unique constraint to prevent duplicate chats per child
CREATE UNIQUE INDEX IF NOT EXISTS idx_chats_child_external_unique ON public.chats(child_id, external_chat_id) WHERE external_chat_id IS NOT NULL;