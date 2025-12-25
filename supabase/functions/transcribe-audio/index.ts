import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TranscribeRequest {
  audio_url: string;
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

    const { audio_url }: TranscribeRequest = await req.json();

    if (!audio_url) {
      throw new Error("audio_url is required");
    }

    console.log("Transcribing audio from URL:", audio_url.substring(0, 100) + "...");

    // Use Lovable AI Gateway with Gemini for audio transcription
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
            content: `אתה מתמלל הודעות קוליות בעברית ובשפות נוספות.
תמלל את ההודעה הקולית בדייקנות.
החזר רק את הטקסט המתומלל, ללא הסברים נוספים.
אם לא ניתן לתמלל, החזר: "[לא ניתן לתמלל]"`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "תמלל את ההודעה הקולית הבאה:"
              },
              {
                type: "audio_url",
                audio_url: { url: audio_url }
              }
            ]
          }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Lovable AI error:", response.status, errorText);
      
      // Check for rate limits
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ 
            transcript: "[שגיאת קצב בקשות - נסה שוב מאוחר יותר]",
            error: "rate_limit" 
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ 
            transcript: "[נדרש תשלום - אנא הוסף קרדיטים]",
            error: "payment_required" 
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ 
          transcript: "[לא ניתן לתמלל]",
          error: "api_error" 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const transcript = data.choices?.[0]?.message?.content?.trim() || "[לא ניתן לתמלל]";

    console.log("Transcription result:", transcript.substring(0, 100) + "...");

    return new Response(
      JSON.stringify({ transcript }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in transcribe-audio function:", error);
    return new Response(
      JSON.stringify({ 
        transcript: "[שגיאה בתמלול]",
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
