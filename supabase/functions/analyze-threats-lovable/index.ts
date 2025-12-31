import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { child_id, messages, child_context } = await req.json();
    
    console.log('[analyze-threats-lovable] Starting analysis with Lovable AI');
    console.log('[analyze-threats-lovable] Child ID:', child_id);
    console.log('[analyze-threats-lovable] Messages count:', messages?.length || 0);
    console.log('[analyze-threats-lovable] Child context:', child_context);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Build the prompt content array for multimodal
    const contentParts: any[] = [];
    
    // System instruction as first text part
    const systemPrompt = `אתה מומחה לזיהוי סכנות לילדים בתקשורת דיגיטלית.
תפקידך לנתח הודעות ומדיה ולזהות:
- בריונות רשת
- תכנים מיניים או לא הולמים
- ניסיונות גרומינג
- איומים או אלימות
- לחץ חברתי שלילי
- תכנים מטרידים

הקשר על הילד: ${child_context || 'לא סופק'}

נתח את ההודעות הבאות וזהה כל סכנה פוטנציאלית.
החזר JSON בפורמט:
{
  "threat_detected": boolean,
  "risk_level": "none" | "low" | "medium" | "high" | "critical",
  "threat_types": string[],
  "explanation": string,
  "recommendations": string[]
}`;

    contentParts.push({ type: "text", text: systemPrompt });

    // Process messages
    let textMessages = '';
    let mediaCount = { images: 0, audio: 0, video: 0 };

    for (const msg of messages || []) {
      const timestamp = new Date(msg.message_timestamp).toLocaleString('he-IL');
      const sender = msg.is_child_sender ? '👦 הילד' : `👤 ${msg.sender_label}`;
      
      // Text content
      if (msg.text_content) {
        textMessages += `[${timestamp}] ${sender}: ${msg.text_content}\n`;
      }

      // Image content
      if (msg.msg_type === 'image' && msg.media_url) {
        mediaCount.images++;
        try {
          // Add image to content parts
          contentParts.push({
            type: "image_url",
            image_url: {
              url: msg.media_url
            }
          });
          contentParts.push({
            type: "text",
            text: `[תמונה ${mediaCount.images} - נשלחה ב-${timestamp} על ידי ${sender}]`
          });
          console.log(`[analyze-threats-lovable] Added image ${mediaCount.images}: ${msg.media_url.substring(0, 50)}...`);
        } catch (e) {
          console.error('[analyze-threats-lovable] Error adding image:', e);
        }
      }

      // Audio content
      if (msg.msg_type === 'audio' && msg.media_url) {
        mediaCount.audio++;
        contentParts.push({
          type: "text",
          text: `[הודעה קולית ${mediaCount.audio} - נשלחה ב-${timestamp} על ידי ${sender}] (URL: ${msg.media_url})`
        });
        console.log(`[analyze-threats-lovable] Added audio reference ${mediaCount.audio}`);
      }

      // Video content
      if (msg.msg_type === 'video' && msg.media_url) {
        mediaCount.video++;
        contentParts.push({
          type: "text",
          text: `[וידאו ${mediaCount.video} - נשלח ב-${timestamp} על ידי ${sender}] (URL: ${msg.media_url})`
        });
        console.log(`[analyze-threats-lovable] Added video reference ${mediaCount.video}`);
      }
    }

    // Add text messages
    if (textMessages) {
      contentParts.push({
        type: "text",
        text: `\n--- הודעות טקסט ---\n${textMessages}`
      });
    }

    console.log('[analyze-threats-lovable] Content parts count:', contentParts.length);
    console.log('[analyze-threats-lovable] Media summary:', mediaCount);

    // Call Lovable AI Gateway (Gemini)
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
            content: contentParts
          }
        ],
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[analyze-threats-lovable] Lovable AI error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ 
          error: 'Rate limit exceeded. Please try again later.',
          status: 429 
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      if (response.status === 402) {
        return new Response(JSON.stringify({ 
          error: 'Payment required. Please add credits.',
          status: 402 
        }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      throw new Error(`Lovable AI error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('[analyze-threats-lovable] Raw response:', JSON.stringify(data).substring(0, 500));

    const aiResponse = data.choices?.[0]?.message?.content;
    console.log('[analyze-threats-lovable] AI Response:', aiResponse?.substring(0, 500));

    // Try to parse JSON from response
    let result;
    try {
      // Extract JSON from response if wrapped in markdown
      const jsonMatch = aiResponse?.match(/```json\s*([\s\S]*?)\s*```/) || 
                        aiResponse?.match(/```\s*([\s\S]*?)\s*```/) ||
                        [null, aiResponse];
      const jsonStr = jsonMatch[1] || aiResponse;
      result = JSON.parse(jsonStr);
    } catch (e) {
      console.log('[analyze-threats-lovable] Could not parse JSON, returning raw response');
      result = {
        threat_detected: false,
        risk_level: 'unknown',
        raw_response: aiResponse,
        parse_error: true
      };
    }

    return new Response(JSON.stringify({
      success: true,
      model: 'google/gemini-2.5-flash',
      provider: 'lovable-ai',
      messages_analyzed: messages?.length || 0,
      media_summary: mediaCount,
      result
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('[analyze-threats-lovable] Error:', error);
    const err = error as Error;
    return new Response(JSON.stringify({ 
      error: err.message,
      stack: err.stack 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
