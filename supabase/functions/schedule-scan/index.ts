import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Adaptive scheduling configuration
const ACTIVE_HOURS_START = 8;  // 08:00
const ACTIVE_HOURS_END = 22;   // 22:00
const ACTIVE_INTERVAL_MINUTES = 10;
const QUIET_INTERVAL_MINUTES = 30;
const NO_ACTIVITY_INTERVAL_MINUTES = 30;
const HEARTBEAT_INTERVAL_MINUTES = 60;

function isActiveHours(): boolean {
  const now = new Date();
  const hour = now.getHours();
  return hour >= ACTIVE_HOURS_START && hour < ACTIVE_HOURS_END;
}

function getOptimalInterval(lastActivityAt: string | null, isActive: boolean): number {
  if (!lastActivityAt) {
    return isActive ? ACTIVE_INTERVAL_MINUTES : QUIET_INTERVAL_MINUTES;
  }
  
  const lastActivity = new Date(lastActivityAt);
  const minutesSinceActivity = (Date.now() - lastActivity.getTime()) / (1000 * 60);
  
  // If no activity for 30+ minutes, extend interval
  if (minutesSinceActivity > 30) {
    return NO_ACTIVITY_INTERVAL_MINUTES;
  }
  
  return isActive ? ACTIVE_INTERVAL_MINUTES : QUIET_INTERVAL_MINUTES;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    console.log('Schedule Scan: Checking chats for scanning...');
    
    const isActive = isActiveHours();
    const now = new Date();
    
    // Get all chats with their checkpoints
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
      // Get checkpoint for this chat
      const { data: checkpoint } = await supabase
        .from('scan_checkpoints')
        .select('*')
        .eq('chat_id', chat.id)
        .single();
      
      const optimalInterval = getOptimalInterval(checkpoint?.last_activity_at, isActive);
      
      // Check if small scan is due
      const lastScanned = checkpoint?.last_scanned_at ? new Date(checkpoint.last_scanned_at) : null;
      const minutesSinceScan = lastScanned ? (now.getTime() - lastScanned.getTime()) / (1000 * 60) : Infinity;
      
      if (minutesSinceScan >= optimalInterval) {
        // Get new messages since last scan
        const { data: newMessages } = await supabase
          .from('messages')
          .select('id, text_content, sender_label, message_timestamp, is_child_sender, image_caption')
          .eq('chat_id', chat.id)
          .gt('created_at', checkpoint?.last_scanned_at || '1970-01-01')
          .order('message_timestamp', { ascending: true });
        
        if (newMessages && newMessages.length > 0) {
          console.log(`Triggering small scan for chat ${chat.id}: ${newMessages.length} new messages`);
          
          // Call small-agent
          const smallAgentPayload = {
            chat_id: chat.id,
            child_id: chat.child_id,
            child_age: parseInt((chat as any).children?.age_range?.split('-')[0]) || 12,
            messages: newMessages.map(m => ({
              id: m.id,
              sender_role: m.is_child_sender ? 'child' : 'other',
              timestamp: m.message_timestamp,
              text: m.text_content || '',
              image_caption: m.image_caption,
              has_audio: false
            }))
          };
          
          // Invoke small-agent
          const { error: invokeError } = await supabase.functions.invoke('small-agent', {
            body: smallAgentPayload
          });
          
          if (invokeError) {
            console.error(`Failed to invoke small-agent for chat ${chat.id}:`, invokeError);
          } else {
            scansTriggered.push(chat.id);
          }
        }
      }
      
      // Check if heartbeat smart scan is due
      const lastSmart = checkpoint?.last_smart_at ? new Date(checkpoint.last_smart_at) : null;
      const minutesSinceSmart = lastSmart ? (now.getTime() - lastSmart.getTime()) / (1000 * 60) : Infinity;
      const lastActivity = checkpoint?.last_activity_at ? new Date(checkpoint.last_activity_at) : null;
      const hadRecentActivity = lastActivity && (now.getTime() - lastActivity.getTime()) / (1000 * 60) < 60;
      
      if (minutesSinceSmart >= HEARTBEAT_INTERVAL_MINUTES && hadRecentActivity) {
        console.log(`Triggering heartbeat smart scan for chat ${chat.id}`);
        
        // Get messages from last hour
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        const { data: recentMessages } = await supabase
          .from('messages')
          .select('id, text_content, sender_label, message_timestamp, is_child_sender, image_caption')
          .eq('chat_id', chat.id)
          .gte('message_timestamp', oneHourAgo.toISOString())
          .order('message_timestamp', { ascending: true });
        
        // Get small signals for these messages
        const messageIds = recentMessages?.map(m => m.id) || [];
        const { data: signals } = await supabase
          .from('small_signals')
          .select('*')
          .in('message_id', messageIds);
        
        if (recentMessages && recentMessages.length > 0) {
          const smartPayload = {
            chat_id: chat.id,
            child_id: chat.child_id,
            child_age: parseInt((chat as any).children?.age_range?.split('-')[0]) || 12,
            timeframe_from: oneHourAgo.toISOString(),
            timeframe_to: now.toISOString(),
            messages: recentMessages.map(m => ({
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
          };
          
          const { error: smartError } = await supabase.functions.invoke('smart-agent', {
            body: smartPayload
          });
          
          if (smartError) {
            console.error(`Failed to invoke smart-agent for chat ${chat.id}:`, smartError);
          } else {
            smartScansTriggered.push(chat.id);
          }
        }
      }
      
      // Update scan interval in checkpoint
      await supabase.from('scan_checkpoints').upsert({
        chat_id: chat.id,
        scan_interval_minutes: optimalInterval,
        updated_at: now.toISOString()
      }, { onConflict: 'chat_id' });
    }
    
    console.log(`Schedule Scan complete: ${scansTriggered.length} small scans, ${smartScansTriggered.length} smart scans`);

    return new Response(
      JSON.stringify({
        success: true,
        is_active_hours: isActive,
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
