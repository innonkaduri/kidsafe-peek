import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Message {
  id: string;
  sender_label: string;
  is_child_sender: boolean;
  msg_type: string;
  message_timestamp: string;
  text_content: string | null;
  chat_name?: string;
  media_url?: string | null;
  media_thumbnail_url?: string | null;
}

interface AnalysisRequest {
  child_id: string;
  scan_id: string;
  messages: Message[];
}

interface MediaAnalysisResult {
  description: string;
  detected_text: string | null;
  risk_indicators: string[];
  risk_level: string;
  confidence: number;
}

// Helper function to verify user authentication and child ownership
async function verifyAuthAndOwnership(
  req: Request,
  childId: string
): Promise<{ userId: string } | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(
      JSON.stringify({ error: "Missing Authorization header" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const token = authHeader.replace("Bearer ", "");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  
  // Auth client for user verification
  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
  
  if (authError || !user) {
    console.error("Auth error:", authError);
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Service client for ownership check (bypasses RLS)
  const supabaseService = createClient(supabaseUrl, supabaseServiceKey);
  
  // Verify user owns the child
  const { data: child, error: childError } = await supabaseService
    .from("children")
    .select("id")
    .eq("id", childId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (childError || !child) {
    console.error("Child ownership verification failed:", childError);
    return new Response(
      JSON.stringify({ error: "Forbidden - You do not own this child resource" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  return { userId: user.id };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const requestBody = await req.json();
    const { child_id, scan_id, messages }: AnalysisRequest = requestBody;

    // Verify authentication and child ownership
    const authResult = await verifyAuthAndOwnership(req, child_id);
    if (authResult instanceof Response) {
      return authResult;
    }

    console.log(`Authenticated user ${authResult.userId} analyzing messages for child ${child_id}`);

    if (!messages || messages.length === 0) {
      return new Response(
        JSON.stringify({
          threatDetected: false,
          riskLevel: null,
          threatTypes: [],
          triggers: [],
          patterns: [],
          explanation: "לא נמצאו הודעות לניתוח",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Limit messages to avoid token overflow - take most recent 50 messages
    const limitedMessages = messages.slice(-50);

    // Analyze media messages with GPT Vision
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const mediaAnalysisResults: Map<string, MediaAnalysisResult> = new Map();
    
    const mediaMessages = limitedMessages.filter(
      (msg) => msg.media_url && ["image", "audio", "video"].includes(msg.msg_type)
    );
    
    // Analyze media in parallel (up to 5 at a time)
    if (mediaMessages.length > 0 && SUPABASE_URL) {
      const authHeader = req.headers.get("Authorization");
      const analyzeMedia = async (msg: Message): Promise<void> => {
        try {
          const response = await fetch(`${SUPABASE_URL}/functions/v1/analyze-media`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": authHeader || "",
            },
            body: JSON.stringify({
              media_url: msg.media_url,
              media_type: msg.msg_type,
              child_id: child_id,
            }),
          });
          
          if (response.ok) {
            const result = await response.json();
            mediaAnalysisResults.set(msg.id, result);
          }
        } catch (error) {
          console.error(`Failed to analyze media ${msg.id}:`, error);
        }
      };
      
      // Process in batches of 5
      for (let i = 0; i < mediaMessages.length; i += 5) {
        const batch = mediaMessages.slice(i, i + 5);
        await Promise.all(batch.map(analyzeMedia));
      }
    }

    // Format messages for analysis - include media analysis results
    const formattedMessages = limitedMessages.map((msg) => {
      const mediaAnalysis = mediaAnalysisResults.get(msg.id);
      let content = msg.text_content || "";
      
      if (mediaAnalysis) {
        if (msg.msg_type === "audio") {
          content = `[הודעה קולית - תמלול: ${mediaAnalysis.detected_text || mediaAnalysis.description}]`;
        } else if (msg.msg_type === "video") {
          content = `[וידאו: ${mediaAnalysis.description}]`;
          if (mediaAnalysis.detected_text) {
            content += ` תוכן: "${mediaAnalysis.detected_text}"`;
          }
        } else {
          content = `[תמונה: ${mediaAnalysis.description}]`;
          if (mediaAnalysis.detected_text) {
            content += ` טקסט בתמונה: "${mediaAnalysis.detected_text}"`;
          }
        }
        
        if (mediaAnalysis.risk_indicators && mediaAnalysis.risk_indicators.length > 0) {
          content += ` [סימני סיכון: ${mediaAnalysis.risk_indicators.join(", ")}]`;
        }
        if (msg.text_content) {
          content += ` כיתוב: ${msg.text_content}`;
        }
      } else if (msg.msg_type !== "text" && !content) {
        content = `[${msg.msg_type === "audio" ? "הודעה קולית" : msg.msg_type === "video" ? "וידאו" : "מדיה"}]`;
      }
      
      return {
        id: msg.id,
        sender: msg.sender_label,
        isChild: msg.is_child_sender,
        type: msg.msg_type,
        time: msg.message_timestamp,
        content: content.slice(0, 500),
        chat: msg.chat_name || "שיחה",
        mediaRiskLevel: mediaAnalysis?.risk_level || null,
      };
    });

    // System instructions for the AI
    const systemInstructions = `אתה מערכת AI לזיהוי סיכונים חמורים לילדים מתוך שיחות.

המטרה שלך:
לאתר **אך ורק** מצבים מסוכנים באמת, שעלולים לגרום לפגיעה ממשית בילד/ה.

❗ חשוב מאוד:
אל תסמן איום אם אין סיכון ברור, חד-משמעי ומגובה בהקשר.
עדיף לפספס מקרה גבולי מאשר להתריע על שטויות.

סוגי סיכון שמותר לזהות:
- חרם, השפלה מתמשכת או אלימות רגשית קשה
- איומים פיזיים מפורשים
- אלימות מינית, הטרדה מינית או פנייה מינית לקטין
- סמים, אלכוהול או שידול לשימוש
- פגיעה עצמית או עידוד לפגיעה עצמית
- סחיטה, איום או מניפולציה מסוכנת

❌ אסור להתריע על:
- שיח יומיומי, בדיחות, קללות קלות
- פוליטיקה, חדשות, דעות
- ויכוחים רגילים
- שפה בוטה בלי איום ממשי
- תוכן לא נעים אך לא מסוכן`;

    const userPrompt = `הודעות לניתוח:
${JSON.stringify(formattedMessages, null, 2)}

נתח את ההודעות וזהה סיכונים לפי ההנחיות.`;

    // Use OpenAI Responses API with structured output
    console.log("Calling OpenAI Responses API...");
    
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1",
        instructions: systemInstructions,
        input: userPrompt,
        text: {
          format: {
            type: "json_schema",
            name: "threat_analysis",
            strict: true,
            schema: {
              type: "object",
              properties: {
                threatDetected: { 
                  type: "boolean",
                  description: "האם זוהה איום או סיכון ממשי"
                },
                riskLevel: { 
                  type: ["string", "null"],
                  enum: ["low", "medium", "high", "critical", null],
                  description: "רמת הסיכון: low, medium, high, critical או null אם אין איום"
                },
                threatTypes: { 
                  type: "array",
                  items: { type: "string" },
                  description: "סוגי האיומים שזוהו"
                },
                triggers: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      messageId: { type: "string" },
                      type: { 
                        type: "string",
                        enum: ["text", "image", "audio", "video"]
                      },
                      preview: { type: "string" },
                      confidence: { type: "number" }
                    },
                    required: ["messageId", "type", "preview", "confidence"],
                    additionalProperties: false
                  },
                  description: "הודעות ספציפיות שגרמו לזיהוי האיום"
                },
                patterns: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      chatId: { type: "string" },
                      patternType: { type: "string" },
                      description: { type: "string" },
                      confidence: { type: "number" }
                    },
                    required: ["chatId", "patternType", "description", "confidence"],
                    additionalProperties: false
                  },
                  description: "דפוסי התנהגות חשודים שזוהו"
                },
                explanation: { 
                  type: "string",
                  description: "הסבר קצר בעברית על הממצאים"
                }
              },
              required: ["threatDetected", "riskLevel", "threatTypes", "triggers", "patterns", "explanation"],
              additionalProperties: false
            }
          }
        }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI Responses API error:", response.status, errorText);
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log("OpenAI Responses API result:", JSON.stringify(result, null, 2));

    // Extract the structured output from the response
    let analysisResult;
    try {
      // The response structure for Responses API
      const outputText = result.output?.[0]?.content?.[0]?.text;
      if (outputText) {
        analysisResult = JSON.parse(outputText);
      } else {
        throw new Error("No output text in response");
      }
    } catch (parseError) {
      console.error("Failed to parse response:", parseError, result);
      analysisResult = {
        threatDetected: false,
        riskLevel: null,
        threatTypes: [],
        triggers: [],
        patterns: [],
        explanation: "לא ניתן לנתח את התוכן כרגע",
      };
    }

    console.log("Analysis complete:", JSON.stringify(analysisResult, null, 2));

    return new Response(JSON.stringify(analysisResult), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in analyze-threats function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
