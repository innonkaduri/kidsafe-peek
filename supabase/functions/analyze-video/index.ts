import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AnalyzeVideoRequest {
  video_url: string;
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

    const { video_url }: AnalyzeVideoRequest = await req.json();

    if (!video_url) {
      throw new Error("video_url is required");
    }

    console.log("Analyzing video from URL:", video_url.substring(0, 100) + "...");

    // Use Lovable AI Gateway with Gemini for video analysis
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
            content: `אתה מנתח וידאו לזיהוי תוכן מסוכן לילדים.
תאר בקצרה מה קורה בוידאו.
חפש במיוחד:
- תוכן אלים או מפחיד
- תוכן מיני או לא הולם
- סמים, אלכוהול או חומרים מסוכנים
- נשק או כלי תקיפה
- התנהגות מסוכנת או פוגענית
- כל דבר שעלול לסכן ילד

החזר תיאור קצר (עד 200 תווים) של מה קורה בוידאו.
אם יש תוכן מסוכן, ציין זאת במפורש.
אם הוידאו תקין, ציין זאת בקצרה.`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "נתח את הוידאו הבא וזהה תוכן מסוכן או לא הולם לילדים:"
              },
              {
                type: "video_url",
                video_url: { url: video_url }
              }
            ]
          }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Lovable AI error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ 
            description: "[שגיאת קצב בקשות]",
            error: "rate_limit" 
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ 
            description: "[נדרש תשלום]",
            error: "payment_required" 
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ 
          description: "[לא ניתן לנתח]",
          error: "api_error" 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const description = data.choices?.[0]?.message?.content?.trim() || "[לא ניתן לנתח]";

    console.log("Video analysis result:", description.substring(0, 100) + "...");

    return new Response(
      JSON.stringify({ description }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in analyze-video function:", error);
    return new Response(
      JSON.stringify({ 
        description: "[שגיאה בניתוח]",
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
