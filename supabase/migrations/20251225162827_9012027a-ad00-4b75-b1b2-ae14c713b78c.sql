-- Remove old CHECK CONSTRAINT if exists
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_msg_type_check;

-- Add new CHECK CONSTRAINT with all supported message types
ALTER TABLE public.messages ADD CONSTRAINT messages_msg_type_check 
CHECK (msg_type = ANY (ARRAY[
  'text'::text, 'image'::text, 'audio'::text, 'video'::text, 'file'::text, 'sticker'::text,
  'reaction'::text, 'quote'::text, 'ptt'::text, 'location'::text, 'contact'::text, 'vcard'::text, 'poll'::text, 'call_log'::text
]));