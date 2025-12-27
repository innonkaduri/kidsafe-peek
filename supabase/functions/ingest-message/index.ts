import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

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
      audio_url,
      audio_transcript
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

    // Run pre-filter
    const preFilterResponse = await fetch(`${SUPABASE_URL}/functions/v1/pre-filter`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: [{
          id: message.id,
          text_content: text,
          image_caption: null,
          sender_label,
          is_child_sender: sender_role === 'child'
        }]
      })
    });

    let preFilterResult: { results: Array<{ priority?: string }>, summary: { suspicious: number } } = { results: [], summary: { suspicious: 0 } };
    if (preFilterResponse.ok) {
      preFilterResult = await preFilterResponse.json();
    }

    const isSuspicious = preFilterResult.summary?.suspicious > 0;
    const filterResult = preFilterResult.results?.[0];

    // If suspicious, trigger immediate Small Agent scan
    if (isSuspicious && filterResult?.priority === 'immediate') {
      console.log(`Suspicious message detected, triggering Small Agent for chat ${chat_id}`);
      
      EdgeRuntime.waitUntil((async () => {
        try {
          // Get child age
          const { data: child } = await supabase
            .from('children')
            .select('age_range')
            .eq('id', child_id)
            .single();
          
          const childAge = child?.age_range ? parseInt(child.age_range.split('-')[0]) || 12 : 12;
          
          // Call Small Agent
          const smallAgentResponse = await fetch(`${SUPABASE_URL}/functions/v1/small-agent`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              chat_id,
              child_id,
              child_age: childAge,
              messages: [{
                id: message.id,
                sender_role,
                timestamp,
                text: text || '',
                image_caption: null,
                has_audio: !!audio_url
              }]
            })
          });
          
          if (smallAgentResponse.ok) {
            const smallResult = await smallAgentResponse.json();
            
            // If should trigger Smart Agent
            if (smallResult.should_trigger_smart) {
              console.log(`Triggering Smart Agent for chat ${chat_id}`);
              
              // Get recent messages for context
              const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
              const { data: recentMessages } = await supabase
                .from('messages')
                .select('*')
                .eq('chat_id', chat_id)
                .gte('message_timestamp', oneHourAgo)
                .order('message_timestamp', { ascending: true })
                .limit(50);
              
              // Get small signals for these messages
              const messageIds = recentMessages?.map(m => m.id) || [];
              const { data: signals } = await supabase
                .from('small_signals')
                .select('*')
                .in('message_id', messageIds);
              
              await fetch(`${SUPABASE_URL}/functions/v1/smart-agent`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  chat_id,
                  child_id,
                  child_age: childAge,
                  timeframe_from: oneHourAgo,
                  timeframe_to: new Date().toISOString(),
                  messages: recentMessages?.map(m => ({
                    id: m.id,
                    sender_role: m.is_child_sender ? 'child' : 'other',
                    timestamp: m.message_timestamp,
                    text: m.text_content || '',
                    image_caption: m.image_caption,
                    audio_transcript: null,
                    has_audio: m.msg_type === 'audio'
                  })) || [],
                  small_agent_results: signals?.map(s => ({
                    message_id: s.message_id,
                    risk_score: s.risk_score,
                    risk_codes: s.risk_codes,
                    escalate: s.escalate
                  })) || []
                })
              });
            }
          }
        } catch (e) {
          console.error('Small Agent background task error:', e);
        }
      })());
    } else {
    // Add to batch queue for hourly scan
      const { data: existing } = await supabase
        .from('scan_checkpoints')
        .select('pending_batch_ids')
        .eq('chat_id', chat_id)
        .maybeSingle();
      
      const currentIds = existing?.pending_batch_ids || [];
      await supabase.from('scan_checkpoints').upsert({
        chat_id,
        pending_batch_ids: [...currentIds, message.id],
        updated_at: new Date().toISOString()
      }, { onConflict: 'chat_id' });
    }

    return new Response(
      JSON.stringify({
        success: true,
        message_id: message.id,
        is_suspicious: isSuspicious,
        pre_filter: filterResult
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
