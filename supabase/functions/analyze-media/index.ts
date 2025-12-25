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
  transcript?: string; // For audio messages
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

// Transcribe audio using the transcribe-audio function
async function transcribeAudio(audioUrl: string): Promise<string> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/transcribe-audio`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audio_url: audioUrl }),
    });

    if (!response.ok) {
      console.error("Transcription failed:", response.status);
      return "[לא ניתן לתמלל]";
    }

    const data = await response.json();
    return data.transcript || "[לא ניתן לתמלל]";
  } catch (error) {
    console.error("Error transcribing audio:", error);
    return "[שגיאה בתמלול]";
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
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

    console.log(`Analyzing ${media_type} from URL:`, media_url.substring(0, 100) + "...");

    // Handle audio - transcribe first, then analyze the text
    if (media_type === "audio") {
      const transcript = await transcribeAudio(media_url);
      
      // Analyze the transcript for risks
      const riskAnalysis = analyzeTranscriptForRisks(transcript);
      
      return new Response(
        JSON.stringify({
          description: `[הודעה קולית]: ${transcript.substring(0, 200)}${transcript.length > 200 ? "..." : ""}`,
          detected_text: transcript,
          risk_indicators: riskAnalysis.indicators,
          risk_level: riskAnalysis.level,
          confidence: riskAnalysis.confidence,
          transcript: transcript,
        } as MediaAnalysisResult),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle video - analyze thumbnail or provide placeholder
    if (media_type === "video") {
      // Try to analyze video with Gemini (which supports video)
      try {
        const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              {
                role: "system",
                content: getVideoAnalysisPrompt()
              },
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: child_context 
                      ? `נתח את הוידאו הזה. הקשר: נשלח לילד/ה ${child_context}`
                      : "נתח את הוידאו הזה וזהה תוכן מסוכן או לא מתאים לילדים"
                  },
                  {
                    type: "video_url",
                    video_url: { url: media_url }
                  }
                ]
              }
            ],
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const content = data.choices?.[0]?.message?.content;
          if (content) {
            const analysisResult = parseAnalysisResponse(content);
            return new Response(JSON.stringify(analysisResult), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
      } catch (videoError) {
        console.error("Video analysis failed:", videoError);
      }

      // Fallback for video
      return new Response(
        JSON.stringify({
          description: "[וידאו]",
          detected_text: null,
          risk_indicators: [],
          risk_level: "none",
          confidence: 0,
        } as MediaAnalysisResult),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle images with Lovable AI (Gemini)
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: getImageAnalysisPrompt()
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: child_context 
                  ? `נתח את התמונה הזו. הקשר: נשלחה לילד/ה ${child_context}`
                  : `נתח את התמונה הזו וזהה תוכן מסוכן או לא מתאים לילדים`
              },
              {
                type: "image_url",
                image_url: { url: media_url }
              }
            ]
          }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Lovable AI API error:", response.status, errorText);
      
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
      throw new Error("No content in Lovable AI response");
    }

    // Parse JSON response
    const analysisResult = parseAnalysisResponse(content);

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

function getImageAnalysisPrompt(): string {
  return `אתה מנתח תוכן מדיה עבור מערכת הגנה על ילדים. 
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
}

function getVideoAnalysisPrompt(): string {
  return `אתה מנתח תוכן וידאו עבור מערכת הגנה על ילדים.
תפקידך לנתח וידאו ולזהות תוכן שעלול להיות מסוכן או לא מתאים לילדים.

זהה:
1. תוכן מיני או סוגסטיבי
2. אלימות או נשק
3. סמים או אלכוהול
4. תוכן מפחיד או מטריד
5. שיחות לא הולמות
6. סימני גרומינג או ניצול

החזר תשובה בפורמט JSON בלבד:
{
  "description": "תיאור קצר של הוידאו",
  "detected_text": "דיבור או טקסט שנמצא בוידאו או null",
  "risk_indicators": ["רשימת סימני סיכון שזוהו"],
  "risk_level": "none" | "low" | "medium" | "high",
  "confidence": 0-1
}`;
}

function parseAnalysisResponse(content: string): MediaAnalysisResult {
  try {
    const cleanedContent = content
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    return JSON.parse(cleanedContent);
  } catch (parseError) {
    console.error("Failed to parse AI response:", content);
    return {
      description: content.substring(0, 200),
      detected_text: null,
      risk_indicators: [],
      risk_level: "none",
      confidence: 0.5,
    };
  }
}

function analyzeTranscriptForRisks(transcript: string): { indicators: string[]; level: "none" | "low" | "medium" | "high"; confidence: number } {
  const lowerTranscript = transcript.toLowerCase();
  const indicators: string[] = [];
  let level: "none" | "low" | "medium" | "high" = "none";
  let confidence = 0.5;

  // Keywords for risk detection
  const highRiskKeywords = ["סמים", "נשק", "להרוג", "לפגוע", "מיני", "סקס", "עירום"];
  const mediumRiskKeywords = ["סוד", "אל תספרי", "אל תספר", "תפגש אותי", "לבד", "מבוגר"];
  const lowRiskKeywords = ["בולינג", "מתעמר", "מציק", "מפחיד"];

  for (const keyword of highRiskKeywords) {
    if (lowerTranscript.includes(keyword)) {
      indicators.push(`מילה חשודה: "${keyword}"`);
      level = "high";
      confidence = 0.8;
    }
  }

  if (level !== "high") {
    for (const keyword of mediumRiskKeywords) {
      if (lowerTranscript.includes(keyword)) {
        indicators.push(`מילה חשודה: "${keyword}"`);
        level = "medium";
        confidence = 0.7;
      }
    }
  }

  if (level === "none") {
    for (const keyword of lowRiskKeywords) {
      if (lowerTranscript.includes(keyword)) {
        indicators.push(`מילה חשודה: "${keyword}"`);
        level = "low";
        confidence = 0.6;
      }
    }
  }

  return { indicators, level, confidence };
}
