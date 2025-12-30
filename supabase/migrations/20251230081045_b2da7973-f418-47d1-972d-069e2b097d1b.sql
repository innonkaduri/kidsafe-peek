-- Add external_message_id column to store unique Green API message ID
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS external_message_id text;

-- Delete duplicate messages, keeping only the first one (by created_at)
DELETE FROM public.messages a
USING public.messages b
WHERE a.id > b.id
  AND a.child_id = b.child_id
  AND a.chat_id = b.chat_id
  AND a.message_timestamp = b.message_timestamp
  AND a.sender_label = b.sender_label
  AND COALESCE(LEFT(a.text_content, 100), '') = COALESCE(LEFT(b.text_content, 100), '');

-- Create unique index to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS messages_unique_content_idx 
ON public.messages (child_id, chat_id, message_timestamp, sender_label, COALESCE(LEFT(text_content, 100), ''));

-- Create unique index on external_message_id for webhook deduplication
CREATE UNIQUE INDEX IF NOT EXISTS messages_external_id_idx 
ON public.messages (external_message_id) WHERE external_message_id IS NOT NULL;