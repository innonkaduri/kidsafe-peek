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
}

interface AnalysisRequest {
  child_id: string;
  scan_id: string;
  messages: Message[];
  lookback_window: string;
}

const SYSTEM_PROMPT = `אתה מומחה לבטיחות ילדים באינטרנט. תפקידך לנתח שיחות הודעות ולזהות סיכונים פוטנציאליים.

עליך לזהות את סוגי האיומים הבאים:
- harassment_bullying: הטרדה או בריונות
- coercion_pressure: לחץ או כפייה לעשות משהו
- extortion_blackmail: סחיטה או איומים
- adult_inappropriate: קשר לא הולם עם מבוגרים או תוכן למבוגרים
- scams_fraud: הונאות או ניסיונות רמאות
- violence_threats: איומים באלימות

עליך להחזיר את התוצאה בפורמט JSON בלבד עם המבנה הבא:
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

הנחיות חשובות:
1. אל תייצר ממצאים שקריים - אם אין סיכון אמיתי, החזר threatDetected: false
2. הסבר קצר וברור בעברית, ללא תוכן גרפי
3. התמקד בדפוסים מסוכנים: בקשות לסודיות, לחץ לשתף תמונות, ניסיונות קשר מתמשכים מזרים
4. דרג את הסיכון לפי חומרה אמיתית`;

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const { child_id, scan_id, messages, lookback_window }: AnalysisRequest = await req.json();

    console.log(`Analyzing ${messages.length} messages for child ${child_id}, scan ${scan_id}`);

    if (!messages || messages.length === 0) {
      console.log("No messages to analyze");
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

    // Format messages for analysis
    const formattedMessages = messages.map((msg) => ({
      id: msg.id,
      sender: msg.sender_label,
      isChild: msg.is_child_sender,
      type: msg.msg_type,
      time: msg.message_timestamp,
      content: msg.text_content || "[מדיה]",
      chat: msg.chat_name || "שיחה",
    }));

    const userPrompt = `נתח את השיחות הבאות וזהה סיכונים פוטנציאליים לילד/ה:

טווח ניתוח: ${lookback_window === "24h" ? "24 שעות אחרונות" : lookback_window === "7d" ? "7 ימים אחרונים" : "30 ימים אחרונים"}

הודעות לניתוח:
${JSON.stringify(formattedMessages, null, 2)}

החזר תשובה בפורמט JSON בלבד.`;

    console.log("Sending request to Lovable AI Gateway...");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limits exceeded, please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required, please add funds to your Lovable AI workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    console.log("AI response received");

    const content = aiResponse.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("No content in AI response");
    }

    // Parse JSON from response (handle markdown code blocks)
    let analysisResult;
    try {
      // Remove markdown code blocks if present
      const cleanedContent = content
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      analysisResult = JSON.parse(cleanedContent);
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      // Return a safe default if parsing fails
      analysisResult = {
        threatDetected: false,
        riskLevel: null,
        threatTypes: [],
        triggers: [],
        patterns: [],
        explanation: "לא ניתן לנתח את התוכן כרגע",
      };
    }

    console.log("Analysis complete:", {
      threatDetected: analysisResult.threatDetected,
      riskLevel: analysisResult.riskLevel,
    });

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
