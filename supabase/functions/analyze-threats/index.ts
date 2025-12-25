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

const ASSISTANT_ID = "asst_14lLHth8XD53y5s5GctIHUBx";

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

    // Clone request to read body twice (once for auth, once for processing)
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
        // Format based on media type
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

    const userPrompt = `אתה מערכת AI לזיהוי סיכונים חמורים לילדים מתוך שיחות.

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
- תוכן לא נעים אך לא מסוכן

הודעות לניתוח:
${JSON.stringify(formattedMessages, null, 2)}

---

📤 החזר **JSON בלבד**, בלי טקסט חופשי, בלי הסברים מסביב.

מבנה החזרה מחייב:
{
  "threatDetected": boolean,
  "riskLevel": "low" | "medium" | "high" | "critical" | null,
  "threatTypes": string[],
  "triggers": [
    {
      "messageId": string,
      "type": "text" | "image" | "audio",
      "preview": string,
      "confidence": number
    }
  ],
  "patterns": [
    {
      "chatId": string,
      "patternType": string,
      "description": string,
      "confidence": number
    }
  ],
  "explanation": string
}

אם אין סיכון ממשי → החזר:
{
  "threatDetected": false,
  "riskLevel": null,
  "threatTypes": [],
  "triggers": [],
  "patterns": [],
  "explanation": "לא זוהה סיכון ממשי"
}`;

    // Step 1: Create a thread
    const threadResponse = await fetch("https://api.openai.com/v1/threads", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "assistants=v2",
      },
      body: JSON.stringify({}),
    });

    if (!threadResponse.ok) {
      const errorText = await threadResponse.text();
      console.error("Failed to create thread:", errorText);
      throw new Error(`Failed to create thread: ${threadResponse.status}`);
    }

    const thread = await threadResponse.json();

    // Step 2: Add message to thread
    const messageResponse = await fetch(`https://api.openai.com/v1/threads/${thread.id}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "assistants=v2",
      },
      body: JSON.stringify({
        role: "user",
        content: userPrompt,
      }),
    });

    if (!messageResponse.ok) {
      const errorText = await messageResponse.text();
      console.error("Failed to add message:", errorText);
      throw new Error(`Failed to add message: ${messageResponse.status}`);
    }

    // Step 3: Run the assistant
    const runResponse = await fetch(`https://api.openai.com/v1/threads/${thread.id}/runs`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "assistants=v2",
      },
      body: JSON.stringify({
        assistant_id: ASSISTANT_ID,
      }),
    });

    if (!runResponse.ok) {
      const errorText = await runResponse.text();
      console.error("Failed to create run:", errorText);
      throw new Error(`Failed to create run: ${runResponse.status}`);
    }

    const run = await runResponse.json();

    // Step 4: Poll for completion
    let runStatus = run.status;
    let lastError: { code?: string; message?: string } | null = null;
    let attempts = 0;
    const maxAttempts = 60;

    const isTerminal = (s: string) => ["completed", "failed", "cancelled", "expired"].includes(s);

    while (!isTerminal(runStatus) && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const statusResponse = await fetch(`https://api.openai.com/v1/threads/${thread.id}/runs/${run.id}`, {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "OpenAI-Beta": "assistants=v2",
        },
      });

      const statusText = await statusResponse.text();
      let statusData: any = {};
      try {
        statusData = statusText ? JSON.parse(statusText) : {};
      } catch {
        // ignore
      }

      runStatus = statusData.status ?? runStatus;
      lastError = statusData.last_error ?? lastError;
      attempts++;

      if (runStatus === "requires_action") {
        console.error("Assistant run requires_action; tool calls are not supported in this function.");
        break;
      }
    }

    if (runStatus !== "completed") {
      const errMsg =
        runStatus === "requires_action"
          ? "Assistant run requires tool actions (requires_action)"
          : lastError?.message
          ? `Run failed: ${lastError.message}`
          : `Run did not complete. Final status: ${runStatus}`;

      console.error("Run failed details:", { runStatus, lastError });
      throw new Error(errMsg);
    }

    // Step 5: Get messages
    const messagesResponse = await fetch(`https://api.openai.com/v1/threads/${thread.id}/messages`, {
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "OpenAI-Beta": "assistants=v2",
      },
    });

    const messagesData = await messagesResponse.json();
    const assistantMessage = messagesData.data.find((m: any) => m.role === "assistant");
    
    if (!assistantMessage) {
      throw new Error("No assistant message found");
    }

    const content = assistantMessage.content[0]?.text?.value;
    if (!content) {
      throw new Error("No content in assistant message");
    }

    // Parse JSON from response
    let analysisResult;
    try {
      const cleanedContent = content
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      analysisResult = JSON.parse(cleanedContent);
    } catch (parseError) {
      console.error("Failed to parse assistant response:", content);
      analysisResult = {
        threatDetected: false,
        riskLevel: null,
        threatTypes: [],
        triggers: [],
        patterns: [],
        explanation: "לא ניתן לנתח את התוכן כרגע",
      };
    }

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
