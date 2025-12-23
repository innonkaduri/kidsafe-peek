import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AnalyzeMediaRequest {
  media_url: string;
  media_type: "image" | "video" | "audio";
  child_id?: string;
  child_context?: string;
}

interface MediaAnalysisResult {
  description: string;
  detected_text: string | null;
  risk_indicators: string[];
  risk_level: "none" | "low" | "medium" | "high";
  confidence: number;
}

// Helper function to verify user authentication and optionally child ownership
async function verifyAuth(
  req: Request,
  childId?: string
): Promise<{ userId: string } | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(
      JSON.stringify({ error: "Missing Authorization header" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const token = authHeader.replace("Bearer ", "");
  
  const supabaseAuth = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!
  );

  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
  
  if (authError || !user) {
    console.error("Auth error:", authError);
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // If child_id provided, verify user owns the child
  if (childId) {
    const { data: child, error: childError } = await supabaseAuth
      .from("children")
      .select("id")
      .eq("id", childId)
      .eq("user_id", user.id)
      .single();

    if (childError || !child) {
      console.error("Child ownership verification failed:", childError);
      return new Response(
        JSON.stringify({ error: "Forbidden - You do not own this child resource" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
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

    const { media_url, media_type, child_id, child_context }: AnalyzeMediaRequest = await req.json();

    // Verify authentication
    const authResult = await verifyAuth(req, child_id);
    if (authResult instanceof Response) {
      return authResult;
    }

    if (!media_url) {
      throw new Error("media_url is required");
    }

    // Only analyze images for now (GPT-4o Vision supports images)
    if (media_type !== "image") {
      return new Response(
        JSON.stringify({
          description: `[${media_type === "audio" ? "הודעה קולית" : "וידאו"}]`,
          detected_text: null,
          risk_indicators: [],
          risk_level: "none",
          confidence: 0,
        } as MediaAnalysisResult),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use GPT-4o-mini for image analysis
    const systemPrompt = `אתה מנתח תוכן מדיה עבור מערכת הגנה על ילדים. 
תפקידך לנתח תמונות ולזהות תוכן שעלול להיות מסוכן או לא מתאים לילדים.

זהה:
1. תוכן מיני או סוגסטיבי
2. אלימות או נשק
3. סמים או אלכוהול
4. תוכן מפחיד או מטריד
5. מידע אישי חשוף (פרטים מזהים, כתובות, מספרי טלפון)
6. צ'אטים עם מבוגרים זרים
7. סימני גרומינג או ניצול

החזר תשובה בפורמט JSON בלבד:
{
  "description": "תיאור קצר של התמונה",
  "detected_text": "טקסט שנמצא בתמונה או null",
  "risk_indicators": ["רשימת סימני סיכון שזוהו"],
  "risk_level": "none" | "low" | "medium" | "high",
  "confidence": 0-1
}`;

    const userMessage = child_context 
      ? `נתח את התמונה הזו. הקשר: נשלחה לילד/ה ${child_context}`
      : `נתח את התמונה הזו וזהה תוכן מסוכן או לא מתאים לילדים`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: userMessage },
              {
                type: "image_url",
                image_url: {
                  url: media_url,
                  detail: "low",
                },
              },
            ],
          },
        ],
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", response.status, errorText);
      
      // Return safe default on API error
      return new Response(
        JSON.stringify({
          description: "[לא ניתן לנתח את התמונה]",
          detected_text: null,
          risk_indicators: [],
          risk_level: "none",
          confidence: 0,
        } as MediaAnalysisResult),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No content in OpenAI response");
    }

    // Parse JSON response
    let analysisResult: MediaAnalysisResult;
    try {
      const cleanedContent = content
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      analysisResult = JSON.parse(cleanedContent);
    } catch (parseError) {
      console.error("Failed to parse OpenAI response:", content);
      analysisResult = {
        description: content.substring(0, 200),
        detected_text: null,
        risk_indicators: [],
        risk_level: "none",
        confidence: 0.5,
      };
    }

    return new Response(JSON.stringify(analysisResult), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in analyze-media function:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error",
        description: "[שגיאה בניתוח]",
        detected_text: null,
        risk_indicators: [],
        risk_level: "none",
        confidence: 0,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
