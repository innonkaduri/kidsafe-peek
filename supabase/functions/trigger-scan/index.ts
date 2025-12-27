import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface TriggerScanRequest {
  child_id: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { child_id }: TriggerScanRequest = await req.json();

    if (!child_id) {
      return new Response(
        JSON.stringify({ error: 'Missing child_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Manual scan triggered for child ${child_id}`);
    const now = new Date();

    // Get child info
    const { data: child, error: childError } = await supabase
      .from('children')
      .select('id, age_range')
      .eq('id', child_id)
      .single();

    if (childError || !child) {
      return new Response(
        JSON.stringify({ error: 'Child not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const childAge = child.age_range ? parseInt(child.age_range.split('-')[0]) || 12 : 12;

    // Get all chats for this child
    const { data: chats, error: chatsError } = await supabase
      .from('chats')
      .select('id')
      .eq('child_id', child_id);

    if (chatsError) throw chatsError;

    const scansTriggered: string[] = [];
    const smartScansTriggered: string[] = [];

    for (const chat of chats || []) {
      // Get messages from last hour
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const { data: messages } = await supabase
        .from('messages')
        .select('id, text_content, sender_label, message_timestamp, is_child_sender, image_caption')
        .eq('chat_id', chat.id)
        .gte('message_timestamp', oneHourAgo.toISOString())
        .order('message_timestamp', { ascending: true });

      if (!messages || messages.length === 0) continue;

      console.log(`Scanning chat ${chat.id}: ${messages.length} messages`);

      // Call small-agent
      const { data: smallResult, error: smallError } = await supabase.functions.invoke('small-agent', {
        body: {
          chat_id: chat.id,
          child_id,
          child_age: childAge,
          messages: messages.map(m => ({
            id: m.id,
            sender_role: m.is_child_sender ? 'child' : 'other',
            timestamp: m.message_timestamp,
            text: m.text_content || '',
            image_caption: m.image_caption,
            has_audio: false
          }))
        }
      });

      if (smallError) {
        console.error(`Small agent error for chat ${chat.id}:`, smallError);
      } else {
        scansTriggered.push(chat.id);

        // Always trigger smart agent on manual scan
        const { data: signals } = await supabase
          .from('small_signals')
          .select('*')
          .in('message_id', messages.map(m => m.id));

        const { error: smartError } = await supabase.functions.invoke('smart-agent', {
          body: {
            chat_id: chat.id,
            child_id,
            child_age: childAge,
            timeframe_from: oneHourAgo.toISOString(),
            timeframe_to: now.toISOString(),
            messages: messages.map(m => ({
              id: m.id,
              sender_role: m.is_child_sender ? 'child' : 'other',
              timestamp: m.message_timestamp,
              text: m.text_content || '',
              image_caption: m.image_caption,
              audio_transcript: null,
              has_audio: false
            })),
            small_agent_results: signals?.map(s => ({
              message_id: s.message_id,
              risk_score: s.risk_score,
              risk_codes: s.risk_codes,
              escalate: s.escalate
            })) || []
          }
        });

        if (smartError) {
          console.error(`Smart agent error for chat ${chat.id}:`, smartError);
        } else {
          smartScansTriggered.push(chat.id);
        }
      }

      // Update checkpoint
      await supabase.from('scan_checkpoints').upsert({
        chat_id: chat.id,
        last_scanned_at: now.toISOString(),
        last_smart_at: now.toISOString(),
        updated_at: now.toISOString()
      }, { onConflict: 'chat_id' });
    }

    console.log(`Manual scan complete: ${scansTriggered.length} small, ${smartScansTriggered.length} smart`);

    return new Response(
      JSON.stringify({
        success: true,
        small_scans: scansTriggered.length,
        smart_scans: smartScansTriggered.length,
        chats_scanned: chats?.length || 0
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Trigger scan error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
