import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Simple fixed interval - scan every 10 minutes
const SCAN_INTERVAL_MINUTES = 10;
const SMART_INTERVAL_MINUTES = 60; // Heartbeat smart scan every hour

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    console.log('Schedule Scan: Starting scan cycle...');
    const now = new Date();
    
    // Get all chats with monitoring enabled
    const { data: chats, error: chatsError } = await supabase
      .from('chats')
      .select(`
        id,
        child_id,
        children!inner(monitoring_enabled, age_range)
      `)
      .eq('children.monitoring_enabled', true);
    
    if (chatsError) throw chatsError;
    
    const scansTriggered: string[] = [];
    const smartScansTriggered: string[] = [];
    
    for (const chat of chats || []) {
      // Get or create checkpoint for this chat
      const { data: checkpoint } = await supabase
        .from('scan_checkpoints')
        .select('*')
        .eq('chat_id', chat.id)
        .maybeSingle();
      
      // Check if small scan is due (every 10 minutes)
      const lastScanned = checkpoint?.last_scanned_at ? new Date(checkpoint.last_scanned_at) : null;
      const minutesSinceScan = lastScanned ? (now.getTime() - lastScanned.getTime()) / (1000 * 60) : Infinity;
      
      if (minutesSinceScan >= SCAN_INTERVAL_MINUTES) {
        // Get new messages since last scan
        const { data: newMessages } = await supabase
          .from('messages')
          .select('id, text_content, sender_label, message_timestamp, is_child_sender, image_caption')
          .eq('chat_id', chat.id)
          .gt('created_at', checkpoint?.last_scanned_at || '1970-01-01')
          .order('message_timestamp', { ascending: true });
        
        if (newMessages && newMessages.length > 0) {
          console.log(`Triggering small scan for chat ${chat.id}: ${newMessages.length} new messages`);
          
          const childAge = parseInt((chat as any).children?.age_range?.split('-')[0]) || 12;
          
          // Call small-agent
          const { data: smallResult, error: invokeError } = await supabase.functions.invoke('small-agent', {
            body: {
              chat_id: chat.id,
              child_id: chat.child_id,
              child_age: childAge,
              messages: newMessages.map(m => ({
                id: m.id,
                sender_role: m.is_child_sender ? 'child' : 'other',
                timestamp: m.message_timestamp,
                text: m.text_content || '',
                image_caption: m.image_caption,
                has_audio: false
              }))
            }
          });
          
          if (invokeError) {
            console.error(`Failed to invoke small-agent for chat ${chat.id}:`, invokeError);
          } else {
            scansTriggered.push(chat.id);
            
            // Check if smart agent should be triggered
            if (smallResult?.should_trigger_smart) {
              console.log(`Small agent triggered smart agent for chat ${chat.id}`);
              await triggerSmartAgent(supabase, chat.id, chat.child_id, childAge, now);
              smartScansTriggered.push(chat.id);
            }
          }
        }
        
        // Update last_scanned_at
        await supabase.from('scan_checkpoints').upsert({
          chat_id: chat.id,
          last_scanned_at: now.toISOString(),
          scan_interval_minutes: SCAN_INTERVAL_MINUTES,
          updated_at: now.toISOString()
        }, { onConflict: 'chat_id' });
      }
      
      // Check if heartbeat smart scan is due (every hour)
      const lastSmart = checkpoint?.last_smart_at ? new Date(checkpoint.last_smart_at) : null;
      const minutesSinceSmart = lastSmart ? (now.getTime() - lastSmart.getTime()) / (1000 * 60) : Infinity;
      
      if (minutesSinceSmart >= SMART_INTERVAL_MINUTES && !smartScansTriggered.includes(chat.id)) {
        const lastActivity = checkpoint?.last_activity_at ? new Date(checkpoint.last_activity_at) : null;
        const hadRecentActivity = lastActivity && (now.getTime() - lastActivity.getTime()) / (1000 * 60) < 120;
        
        if (hadRecentActivity) {
          console.log(`Triggering heartbeat smart scan for chat ${chat.id}`);
          const childAge = parseInt((chat as any).children?.age_range?.split('-')[0]) || 12;
          await triggerSmartAgent(supabase, chat.id, chat.child_id, childAge, now);
          smartScansTriggered.push(chat.id);
        }
      }
    }
    
    console.log(`Schedule Scan complete: ${scansTriggered.length} small scans, ${smartScansTriggered.length} smart scans`);

    return new Response(
      JSON.stringify({
        success: true,
        small_scans_triggered: scansTriggered.length,
        smart_scans_triggered: smartScansTriggered.length,
        chats_processed: chats?.length || 0
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Schedule Scan error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function triggerSmartAgent(supabase: any, chatId: string, childId: string, childAge: number, now: Date) {
  // Get messages from last hour
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const { data: recentMessages } = await supabase
    .from('messages')
    .select('id, text_content, sender_label, message_timestamp, is_child_sender, image_caption')
    .eq('chat_id', chatId)
    .gte('message_timestamp', oneHourAgo.toISOString())
    .order('message_timestamp', { ascending: true });
  
  if (!recentMessages || recentMessages.length === 0) {
    return;
  }
  
  // Get small signals for these messages
  const messageIds = recentMessages.map((m: any) => m.id);
  const { data: signals } = await supabase
    .from('small_signals')
    .select('*')
    .in('message_id', messageIds);
  
  const { error: smartError } = await supabase.functions.invoke('smart-agent', {
    body: {
      chat_id: chatId,
      child_id: childId,
      child_age: childAge,
      timeframe_from: oneHourAgo.toISOString(),
      timeframe_to: now.toISOString(),
      messages: recentMessages.map((m: any) => ({
        id: m.id,
        sender_role: m.is_child_sender ? 'child' : 'other',
        timestamp: m.message_timestamp,
        text: m.text_content || '',
        image_caption: m.image_caption,
        audio_transcript: null,
        has_audio: false
      })),
      small_agent_results: signals?.map((s: any) => ({
        message_id: s.message_id,
        risk_score: s.risk_score,
        risk_codes: s.risk_codes,
        escalate: s.escalate
      })) || []
    }
  });
  
  if (smartError) {
    console.error(`Failed to invoke smart-agent for chat ${chatId}:`, smartError);
  } else {
    // Update last_smart_at
    await supabase.from('scan_checkpoints').upsert({
      chat_id: chatId,
      last_smart_at: now.toISOString(),
      updated_at: now.toISOString()
    }, { onConflict: 'chat_id' });
  }
}
