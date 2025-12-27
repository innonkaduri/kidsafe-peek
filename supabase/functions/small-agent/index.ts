import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Token cost estimates for gpt-4o-mini (per 1M tokens)
const INPUT_COST_PER_1M = 0.15;
const OUTPUT_COST_PER_1M = 0.60;

const SYSTEM_PROMPT = `SafeKids Small Agent. Fast risk detection for child safety.
Rules: No drama. Few false positives. Score 0-100.
Risk codes: GROOMING, SEXUAL, VIOLENCE, MEETUP, EXTORTION, NUDES_REQUEST, ISOLATION, MANIPULATION, DRUGS, SELF_HARM, BULLYING
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

async function updateUsageMeter(
  supabase: any,
  childId: string,
  callType: 'small' | 'smart' | 'fallback' | 'image_caption',
  inputTokens: number,
  outputTokens: number
) {
  const monthKey = new Date().toISOString().slice(0, 7); // YYYY-MM
  
  // Calculate estimated cost based on model
  let estCost = 0;
  if (callType === 'small') {
    // gpt-4o-mini pricing
    estCost = (inputTokens * INPUT_COST_PER_1M + outputTokens * OUTPUT_COST_PER_1M) / 1_000_000;
  }
  
  try {
    // Try to upsert usage meter
    const { data: existing } = await supabase
      .from('usage_meter')
      .select('*')
      .eq('child_id', childId)
      .eq('month_yyyy_mm', monthKey)
      .single();
    
    if (existing) {
      const updates: any = {
        est_cost_usd: (parseFloat(existing.est_cost_usd) || 0) + estCost,
        updated_at: new Date().toISOString()
      };
      
      if (callType === 'small') updates.small_calls = (existing.small_calls || 0) + 1;
      if (callType === 'smart') updates.smart_calls = (existing.smart_calls || 0) + 1;
      if (callType === 'fallback') updates.fallback_calls = (existing.fallback_calls || 0) + 1;
      if (callType === 'image_caption') updates.image_caption_calls = (existing.image_caption_calls || 0) + 1;
      
      await supabase
        .from('usage_meter')
        .update(updates)
        .eq('id', existing.id);
    } else {
      await supabase.from('usage_meter').insert({
        child_id: childId,
        month_yyyy_mm: monthKey,
        est_cost_usd: estCost,
        small_calls: callType === 'small' ? 1 : 0,
        smart_calls: callType === 'smart' ? 1 : 0,
        fallback_calls: callType === 'fallback' ? 1 : 0,
        image_caption_calls: callType === 'image_caption' ? 1 : 0
      });
    }
  } catch (e) {
    console.error('Failed to update usage meter:', e);
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

    // Call OpenAI gpt-4o-mini
    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: USER_TEMPLATE(child_age, messages) }
        ],
        temperature: 0.2,
        max_tokens: 500,
        response_format: { type: "json_object" }
      })
    });

    const latencyMs = Date.now() - startTime;

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('OpenAI API error:', aiResponse.status, errorText);
      
      await logModelCall(supabase, 'small-agent', 'gpt-4o-mini', 0, 0, latencyMs, false, child_id, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limited, retry later' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      throw new Error(`OpenAI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || '';
    
    // Log usage
    const usage = aiData.usage || {};
    await logModelCall(
      supabase,
      'small-agent',
      'gpt-4o-mini',
      usage.prompt_tokens || 0,
      usage.completion_tokens || 0,
      latencyMs,
      true,
      child_id
    );

    // Update usage meter
    await updateUsageMeter(
      supabase,
      child_id,
      'small',
      usage.prompt_tokens || 0,
      usage.completion_tokens || 0
    );

    // Parse JSON response
    let analysisResult;
    try {
      const cleanContent = content.replace(/```json\n?|\n?```/g, '').trim();
      analysisResult = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error('Failed to parse AI response:', content);
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

    // Update checkpoint with activity
    await supabase.from('scan_checkpoints').upsert({
      chat_id,
      last_scanned_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, { onConflict: 'chat_id' });

    // Check if Smart Agent should be triggered
    const shouldTriggerSmart = 
      batchEscalate ||
      results.some(r => r.risk_score >= 40) ||
      results.some(r => r.escalate) ||
      results.some(r => r.risk_codes?.some(c => 
        ['MEETUP', 'EXTORTION', 'NUDES_REQUEST', 'ISOLATION', 'GROOMING'].includes(c)
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
