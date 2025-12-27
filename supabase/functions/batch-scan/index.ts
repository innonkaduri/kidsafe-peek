import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// This function runs hourly to process batch (non-suspicious) messages
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    console.log('Batch scan: Starting hourly scan');

    // Get all checkpoints with pending batch messages
    const { data: checkpoints, error: checkpointsError } = await supabase
      .from('scan_checkpoints')
      .select('*')
      .not('pending_batch_ids', 'eq', '{}')
      .not('pending_batch_ids', 'is', null);

    if (checkpointsError) {
      throw checkpointsError;
    }

    if (!checkpoints || checkpoints.length === 0) {
      console.log('Batch scan: No pending messages');
      return new Response(
        JSON.stringify({ success: true, processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Batch scan: Processing ${checkpoints.length} chats`);

    let totalProcessed = 0;
    const results = [];

    for (const checkpoint of checkpoints) {
      try {
        const pendingIds = checkpoint.pending_batch_ids || [];
        
        if (pendingIds.length === 0) continue;

        // Get messages
        const { data: messages } = await supabase
          .from('messages')
          .select('*, chats(child_id, children(age_range))')
          .in('id', pendingIds);

        if (!messages || messages.length === 0) {
          // Clear pending if no messages found
          await supabase
            .from('scan_checkpoints')
            .update({ pending_batch_ids: [] })
            .eq('id', checkpoint.id);
          continue;
        }

        const childId = messages[0]?.chats?.child_id;
        const ageRange = messages[0]?.chats?.children?.age_range;
        const childAge = ageRange ? parseInt(ageRange.split('-')[0]) || 12 : 12;

        // Call Small Agent with batch
        const smallAgentResponse = await fetch(`${SUPABASE_URL}/functions/v1/small-agent`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            chat_id: checkpoint.chat_id,
            child_id: childId,
            child_age: childAge,
            messages: messages.map(m => ({
              id: m.id,
              sender_role: m.is_child_sender ? 'child' : 'other',
              timestamp: m.message_timestamp,
              text: m.text_content || '',
              image_caption: m.image_caption,
              has_audio: m.msg_type === 'audio'
            }))
          })
        });

        if (smallAgentResponse.ok) {
          const smallResult = await smallAgentResponse.json();
          
          totalProcessed += messages.length;
          results.push({
            chat_id: checkpoint.chat_id,
            messages_processed: messages.length,
            should_trigger_smart: smallResult.should_trigger_smart
          });

          // If should trigger Smart Agent
          if (smallResult.should_trigger_smart) {
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
            const now = new Date().toISOString();
            
            // Get all recent messages
            const { data: recentMessages } = await supabase
              .from('messages')
              .select('*')
              .eq('chat_id', checkpoint.chat_id)
              .gte('message_timestamp', oneHourAgo)
              .order('message_timestamp', { ascending: true })
              .limit(50);
            
            // Get signals
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
                chat_id: checkpoint.chat_id,
                child_id: childId,
                child_age: childAge,
                timeframe_from: oneHourAgo,
                timeframe_to: now,
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

        // Clear pending batch
        await supabase
          .from('scan_checkpoints')
          .update({ 
            pending_batch_ids: [],
            updated_at: new Date().toISOString()
          })
          .eq('id', checkpoint.id);

      } catch (chatError) {
        console.error(`Error processing chat ${checkpoint.chat_id}:`, chatError);
      }
    }

    console.log(`Batch scan complete: ${totalProcessed} messages processed`);

    return new Response(
      JSON.stringify({
        success: true,
        processed: totalProcessed,
        chats: checkpoints.length,
        results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Batch scan error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
