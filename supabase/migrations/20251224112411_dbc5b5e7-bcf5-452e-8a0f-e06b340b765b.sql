-- Allow additional message types from WhatsApp connectors (e.g. stickers)
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_msg_type_check;

ALTER TABLE public.messages
ADD CONSTRAINT messages_msg_type_check
CHECK (
  msg_type = ANY (
    ARRAY[
      'text'::text,
      'image'::text,
      'audio'::text,
      'video'::text,
      'file'::text,
      'sticker'::text
    ]
  )
);
