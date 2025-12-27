import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface IngestRequest {
  child_id: string;
  chat_id: string;
  sender_role: 'child' | 'other';
  sender_label: string;
  timestamp: string;
  text?: string;
  image_url?: string;
  audio_url?: string;
  audio_transcript?: string;
}

declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const request: IngestRequest = await req.json();
    const {
      child_id,
      chat_id,
      sender_role,
      sender_label,
      timestamp,
      text,
      image_url,
      audio_url
    } = request;

    if (!child_id || !chat_id || !sender_role || !timestamp) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: child_id, chat_id, sender_role, timestamp' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine message type
    let msgType = 'text';
    if (image_url) msgType = 'image';
    else if (audio_url) msgType = 'audio';

    // Insert message
    const { data: message, error: messageError } = await supabase
      .from('messages')
      .insert({
        child_id,
        chat_id,
        sender_label: sender_label || sender_role,
        is_child_sender: sender_role === 'child',
        message_timestamp: timestamp,
        msg_type: msgType,
        text_content: text || null,
        text_excerpt: text ? text.substring(0, 100) : null,
        media_url: image_url || audio_url || null
      })
      .select()
      .single();

    if (messageError) {
      console.error('Failed to insert message:', messageError);
      return new Response(
        JSON.stringify({ error: 'Failed to insert message', details: messageError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Message ingested: ${message.id} for child ${child_id}`);

    // If image, trigger caption generation in background
    if (image_url) {
      EdgeRuntime.waitUntil((async () => {
        try {
          const captionResponse = await fetch(`${SUPABASE_URL}/functions/v1/caption-image`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              message_id: message.id,
              image_url
            })
          });
          
          if (!captionResponse.ok) {
            console.error('Caption generation failed:', await captionResponse.text());
          }
        } catch (e) {
          console.error('Caption background task error:', e);
        }
      })());
    }

    // Update last activity timestamp for the chat checkpoint
    await supabase.from('scan_checkpoints').upsert({
      chat_id,
      last_activity_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, { onConflict: 'chat_id' });

    return new Response(
      JSON.stringify({
        success: true,
        message_id: message.id
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Ingest error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
