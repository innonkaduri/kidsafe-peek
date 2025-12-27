import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Optimized short prompt for cost efficiency
const SYSTEM_PROMPT = `SafeKids Small Agent. Fast risk detection for child safety.
Rules: No drama. Few false positives. Score 0-100.
Output STRICT JSON only.`;

const USER_TEMPLATE = (childAge: number, messages: any[]) => `
Analyze messages. Child age: ${childAge}.
Messages: ${JSON.stringify(messages)}

Return JSON:
{"messages_analysis":[{"message_id":"","risk_score":0,"risk_codes":[],"escalate":false}],"batch_escalate":false}`;

interface SmallAgentRequest {
  chat_id: string;
  child_id: string;
  child_age?: number;
  messages: {
    id: string;
    sender_role: string;
    timestamp: string;
    text: string;
    image_caption: string | null;
    has_audio: boolean;
  }[];
}

interface SmallAgentResult {
  message_id: string;
  risk_score: number;
  risk_codes: string[];
  escalate: boolean;
}

async function logModelCall(
  supabase: any,
  functionName: string,
  model: string,
  requestTokens: number,
  responseTokens: number,
  latencyMs: number,
  success: boolean,
  childId: string | null,
  errorMessage?: string
) {
  try {
    await supabase.from('model_logs').insert({
      function_name: functionName,
      model,
      request_tokens: requestTokens,
      response_tokens: responseTokens,
      latency_ms: latencyMs,
      success,
      error_message: errorMessage,
      child_id: childId
    });
  } catch (e) {
    console.error('Failed to log model call:', e);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const startTime = Date.now();

  try {
    const { chat_id, child_id, child_age = 12, messages }: SmallAgentRequest = await req.json();

    if (!messages || messages.length === 0) {
      return new Response(
        JSON.stringify({ results: [], batch_escalate: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Small Agent: Processing ${messages.length} messages for chat ${chat_id}`);

    // Call Lovable AI (Gemini Flash)
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: USER_TEMPLATE(child_age, messages) }
        ],
        temperature: 0.2,
        max_tokens: 500
      })
    });

    const latencyMs = Date.now() - startTime;

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      
      await logModelCall(supabase, 'small-agent', 'gemini-2.5-flash', 0, 0, latencyMs, false, child_id, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limited, retry later' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || '';
    
    // Log usage
    const usage = aiData.usage || {};
    await logModelCall(
      supabase,
      'small-agent',
      'gemini-2.5-flash',
      usage.prompt_tokens || 0,
      usage.completion_tokens || 0,
      latencyMs,
      true,
      child_id
    );

    // Parse JSON response
    let analysisResult;
    try {
      // Clean potential markdown formatting
      const cleanContent = content.replace(/```json\n?|\n?```/g, '').trim();
      analysisResult = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error('Failed to parse AI response:', content);
      // Return empty results on parse error
      return new Response(
        JSON.stringify({ results: [], batch_escalate: false, parse_error: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results: SmallAgentResult[] = analysisResult.messages_analysis || [];
    const batchEscalate = analysisResult.batch_escalate || false;

    // Store signals in database
    for (const result of results) {
      try {
        await supabase.from('small_signals').insert({
          message_id: result.message_id,
          risk_score: result.risk_score,
          risk_codes: result.risk_codes || [],
          escalate: result.escalate || false
        });
      } catch (insertError) {
        console.error('Failed to insert signal:', insertError);
      }
    }

    // Update checkpoint
    await supabase.from('scan_checkpoints').upsert({
      chat_id,
      last_scanned_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, { onConflict: 'chat_id' });

    // Check if Smart Agent should be triggered
    const shouldTriggerSmart = 
      batchEscalate ||
      results.some(r => r.risk_score >= 40) ||
      results.some(r => r.escalate) ||
      results.some(r => r.risk_codes?.some(c => 
        ['MEETUP', 'EXTORTION', 'NUDES_REQUEST', 'ISOLATION'].includes(c)
      ));

    console.log(`Small Agent complete: ${results.length} signals, batch_escalate=${batchEscalate}, trigger_smart=${shouldTriggerSmart}`);

    return new Response(
      JSON.stringify({
        results,
        batch_escalate: batchEscalate,
        should_trigger_smart: shouldTriggerSmart,
        latency_ms: latencyMs
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Small Agent error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
