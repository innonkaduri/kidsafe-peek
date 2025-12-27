import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CAPTION_PROMPT = `Describe this image in 1-2 neutral sentences for child safety context.
If concerning content detected, add flags.
Return JSON only:
{"caption":"description","flags":["FLAG_CODE"]}
Flags: ADULT_CONTENT, VIOLENCE, WEAPONS, DRUGS, INAPPROPRIATE, NONE`;

interface CaptionRequest {
  message_id: string;
  image_url: string;
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
    const { message_id, image_url }: CaptionRequest = await req.json();

    if (!message_id || !image_url) {
      return new Response(
        JSON.stringify({ error: 'message_id and image_url required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Caption image: Processing ${message_id}`);

    // Get child_id from message for logging
    const { data: message } = await supabase
      .from('messages')
      .select('child_id')
      .eq('id', message_id)
      .single();

    const childId = message?.child_id || null;

    // Call Lovable AI with vision capability
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: CAPTION_PROMPT },
              { type: 'image_url', image_url: { url: image_url } }
            ]
          }
        ],
        temperature: 0.3,
        max_tokens: 200
      })
    });

    const latencyMs = Date.now() - startTime;

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      
      await logModelCall(supabase, 'caption-image', 'gemini-2.5-flash', 0, 0, latencyMs, false, childId, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limited' }), {
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
      'caption-image',
      'gemini-2.5-flash',
      usage.prompt_tokens || 0,
      usage.completion_tokens || 0,
      latencyMs,
      true,
      childId
    );

    // Parse response
    let caption = '';
    let flags: string[] = [];
    
    try {
      const cleanContent = content.replace(/```json\n?|\n?```/g, '').trim();
      const parsed = JSON.parse(cleanContent);
      caption = parsed.caption || '';
      flags = parsed.flags || [];
    } catch {
      // If JSON parse fails, use raw content as caption
      caption = content.substring(0, 200);
      flags = [];
    }

    // Update message with caption and flags
    const { error: updateError } = await supabase
      .from('messages')
      .update({
        image_caption: caption,
        image_flags: flags.filter(f => f !== 'NONE')
      })
      .eq('id', message_id);

    if (updateError) {
      console.error('Failed to update message with caption:', updateError);
    }

    console.log(`Caption complete for ${message_id}: "${caption.substring(0, 50)}...", flags: ${flags.join(', ')}`);

    return new Response(
      JSON.stringify({
        success: true,
        message_id,
        caption,
        flags,
        latency_ms: latencyMs
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Caption image error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
