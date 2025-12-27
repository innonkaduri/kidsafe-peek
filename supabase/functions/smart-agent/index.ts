import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Optimized Smart Agent prompt
const SYSTEM_PROMPT = `SafeKids Smart Context Agent.
Make contextual safety decision. Patterns > single messages.
Evidence-based, avoid false positives.
Output STRICT JSON only.`;

const USER_TEMPLATE = (metadata: any, messages: any[], smallResults: any[]) => `
Evaluate context. Decide action.
Metadata: ${JSON.stringify(metadata)}
Messages: ${JSON.stringify(messages)}
Small agent results: ${JSON.stringify(smallResults)}

Return JSON:
{"final_risk_score":0,"threat_type":"none","confidence":0.0,"action":"ignore","key_reasons":[],"evidence_message_ids":[]}
threat_type: grooming|sexual_content|violence|extortion|manipulation|none
action: ignore|monitor|alert`;

interface SmartAgentRequest {
  chat_id: string;
  child_id: string;
  child_age?: number;
  platform?: string;
  timeframe_from: string;
  timeframe_to: string;
  messages: {
    id: string;
    sender_role: string;
    timestamp: string;
    text: string;
    image_caption: string | null;
    audio_transcript: string | null;
    has_audio: boolean;
  }[];
  small_agent_results: {
    message_id: string;
    risk_score: number;
    risk_codes: string[];
    escalate: boolean;
  }[];
}

interface SmartDecision {
  final_risk_score: number;
  threat_type: string;
  confidence: number;
  action: 'ignore' | 'monitor' | 'alert';
  key_reasons: string[];
  evidence_message_ids: string[];
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
    const request: SmartAgentRequest = await req.json();
    const {
      chat_id,
      child_id,
      child_age = 12,
      platform = 'whatsapp',
      timeframe_from,
      timeframe_to,
      messages,
      small_agent_results
    } = request;

    if (!messages || messages.length === 0) {
      return new Response(
        JSON.stringify({ 
          decision: { action: 'ignore', final_risk_score: 0, confidence: 1.0 },
          no_messages: true
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Smart Agent: Processing ${messages.length} messages for chat ${chat_id}`);

    const metadata = {
      child_age,
      platform,
      timeframe: { from: timeframe_from, to: timeframe_to }
    };

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
          { role: 'user', content: USER_TEMPLATE(metadata, messages, small_agent_results) }
        ],
        temperature: 0.2,
        max_tokens: 600
      })
    });

    const latencyMs = Date.now() - startTime;

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      
      await logModelCall(supabase, 'smart-agent', 'gemini-2.5-flash', 0, 0, latencyMs, false, child_id, errorText);
      
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
      'smart-agent',
      'gemini-2.5-flash',
      usage.prompt_tokens || 0,
      usage.completion_tokens || 0,
      latencyMs,
      true,
      child_id
    );

    // Parse JSON response
    let decision: SmartDecision;
    try {
      const cleanContent = content.replace(/```json\n?|\n?```/g, '').trim();
      decision = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error('Failed to parse AI response:', content);
      decision = {
        final_risk_score: 0,
        threat_type: 'none',
        confidence: 0,
        action: 'ignore',
        key_reasons: ['PARSE_ERROR'],
        evidence_message_ids: []
      };
    }

    // Store decision in database
    const { data: smartDecision, error: insertError } = await supabase
      .from('smart_decisions')
      .insert({
        chat_id,
        child_id,
        timeframe_from,
        timeframe_to,
        final_risk_score: decision.final_risk_score,
        threat_type: decision.threat_type,
        confidence: decision.confidence,
        action: decision.action,
        key_reasons: decision.key_reasons,
        evidence_message_ids: decision.evidence_message_ids
      })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to insert smart decision:', insertError);
    }

    // Update checkpoint
    await supabase.from('scan_checkpoints').upsert({
      chat_id,
      last_smart_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, { onConflict: 'chat_id' });

    // If action is 'alert', create a finding
    if (decision.action === 'alert' && smartDecision) {
      const { error: findingError } = await supabase.from('findings').insert({
        child_id,
        scan_id: smartDecision.id, // Using smart_decision id as scan reference
        threat_detected: true,
        risk_level: decision.final_risk_score >= 70 ? 'high' : 
                   decision.final_risk_score >= 40 ? 'medium' : 'low',
        threat_types: [decision.threat_type],
        explanation: decision.key_reasons.join(', '),
        smart_decision_id: smartDecision.id
      });

      if (findingError) {
        console.error('Failed to create finding:', findingError);
      } else {
        console.log(`Alert created for chat ${chat_id}, risk score: ${decision.final_risk_score}`);
      }
    }

    console.log(`Smart Agent complete: action=${decision.action}, risk=${decision.final_risk_score}, threat=${decision.threat_type}`);

    return new Response(
      JSON.stringify({
        decision,
        smart_decision_id: smartDecision?.id,
        latency_ms: latencyMs
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Smart Agent error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
