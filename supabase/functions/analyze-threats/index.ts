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

interface MediaData {
  base64: string;
  mimeType: string;
}

// Download media and convert to Base64 - with size limit to prevent memory issues
const MAX_FILE_SIZE = 150 * 1024; // 150KB limit per file

async function downloadMediaAsBase64(url: string): Promise<MediaData | null> {
  try {
    console.log(`Downloading media from: ${url}`);
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SafetyBot/1.0)",
      },
    });
    
    if (!response.ok) {
      console.error(`Failed to download media: ${response.status}`);
      return null;
    }
    
    // Check content length before downloading
    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > MAX_FILE_SIZE) {
      console.log(`Skipping large file: ${contentLength} bytes`);
      return null;
    }
    
    const contentType = response.headers.get("content-type") || "image/jpeg";
    const buffer = await response.arrayBuffer();
    
    // Skip if too large (backup check)
    if (buffer.byteLength > MAX_FILE_SIZE) {
      console.log(`Skipping large file after download: ${buffer.byteLength} bytes`);
      return null;
    }
    
    const uint8Array = new Uint8Array(buffer);
    
    // Convert to base64 in chunks to reduce memory pressure
    const CHUNK_SIZE = 8192;
    let binary = "";
    for (let i = 0; i < uint8Array.length; i += CHUNK_SIZE) {
      const chunk = uint8Array.subarray(i, Math.min(i + CHUNK_SIZE, uint8Array.length));
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    const base64 = btoa(binary);
    
    console.log(`Downloaded media: ${contentType}, size: ${uint8Array.length} bytes`);
    return { base64, mimeType: contentType };
  } catch (error) {
    console.error("Failed to download media:", error);
    return null;
  }
}

// Transcribe audio using the transcribe-audio edge function
async function transcribeAudio(audioUrl: string, authHeader: string): Promise<string | null> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (!supabaseUrl) return null;

    console.log(`Transcribing audio from: ${audioUrl}`);
    const response = await fetch(`${supabaseUrl}/functions/v1/transcribe-audio`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": authHeader,
      },
      body: JSON.stringify({ audio_url: audioUrl }),
    });

    if (!response.ok) {
      console.error(`Failed to transcribe audio: ${response.status}`);
      return null;
    }

    const result = await response.json();
    console.log(`Transcription result:`, result);
    return result.transcription || result.text || null;
  } catch (error) {
    console.error("Failed to transcribe audio:", error);
    return null;
  }
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

    const authHeader = req.headers.get("Authorization") || "";
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

    // Process media messages - download images as Base64 and transcribe audio
    const mediaDataMap: Map<string, { type: "image" | "audio" | "video"; data: MediaData | null; transcription: string | null }> = new Map();
    
    const mediaMessages = limitedMessages.filter(
      (msg) => msg.media_url && ["image", "audio", "video"].includes(msg.msg_type)
    );

    console.log(`Processing ${mediaMessages.length} media messages...`);

    // Limit to 5 images to prevent memory overflow
    let imageCount = 0;
    const MAX_IMAGES = 5;

    // Process images one at a time to minimize memory usage
    for (const msg of mediaMessages) {
      if (msg.msg_type === "audio" && msg.media_url) {
        // Transcribe audio
        const transcription = await transcribeAudio(msg.media_url, authHeader);
        mediaDataMap.set(msg.id, { type: "audio", data: null, transcription });
      } else if (msg.msg_type === "image" && msg.media_url && imageCount < MAX_IMAGES) {
        // Download image as Base64
        const mediaData = await downloadMediaAsBase64(msg.media_url);
        if (mediaData) {
          mediaDataMap.set(msg.id, { type: "image", data: mediaData, transcription: null });
          imageCount++;
        }
      } else if (msg.msg_type === "video" && imageCount < MAX_IMAGES) {
        // For video, prefer thumbnail which is smaller
        const thumbnailUrl = msg.media_thumbnail_url;
        if (thumbnailUrl) {
          const mediaData = await downloadMediaAsBase64(thumbnailUrl);
          if (mediaData) {
            mediaDataMap.set(msg.id, { type: "video", data: mediaData, transcription: null });
            imageCount++;
          }
        }
      }
    }

    console.log(`Processed media: ${imageCount} images, ${mediaDataMap.size} total`);

    // Build text content for messages
    const textParts: string[] = [];
    const imageParts: { type: "image_url"; image_url: { url: string; detail: string } }[] = [];

    for (const msg of limitedMessages) {
      const mediaInfo = mediaDataMap.get(msg.id);
      let messageText = "";

      if (msg.msg_type === "text") {
        messageText = `[${msg.message_timestamp}] ${msg.sender_label}${msg.is_child_sender ? " (הילד/ה)" : ""}: ${msg.text_content || ""}`;
      } else if (mediaInfo?.type === "audio" && mediaInfo.transcription) {
        messageText = `[${msg.message_timestamp}] ${msg.sender_label}${msg.is_child_sender ? " (הילד/ה)" : ""}: [הודעה קולית - תמלול: "${mediaInfo.transcription}"]`;
        if (msg.text_content) {
          messageText += ` כיתוב: ${msg.text_content}`;
        }
      } else if (mediaInfo?.type === "image" && mediaInfo.data) {
        messageText = `[${msg.message_timestamp}] ${msg.sender_label}${msg.is_child_sender ? " (הילד/ה)" : ""}: [תמונה - ראה תמונה מצורפת #${imageParts.length + 1}]`;
        if (msg.text_content) {
          messageText += ` כיתוב: ${msg.text_content}`;
        }
        // Add image to image parts
        imageParts.push({
          type: "image_url",
          image_url: {
            url: `data:${mediaInfo.data.mimeType};base64,${mediaInfo.data.base64}`,
            detail: "low" // Use low detail to save tokens
          }
        });
      } else if (mediaInfo?.type === "video" && mediaInfo.data) {
        messageText = `[${msg.message_timestamp}] ${msg.sender_label}${msg.is_child_sender ? " (הילד/ה)" : ""}: [וידאו - ראה תמונה ממוזערת #${imageParts.length + 1}]`;
        if (msg.text_content) {
          messageText += ` כיתוב: ${msg.text_content}`;
        }
        // Add thumbnail to image parts
        imageParts.push({
          type: "image_url",
          image_url: {
            url: `data:${mediaInfo.data.mimeType};base64,${mediaInfo.data.base64}`,
            detail: "low"
          }
        });
      } else if (msg.msg_type !== "text") {
        // Media without data
        const mediaLabel = msg.msg_type === "audio" ? "הודעה קולית" : msg.msg_type === "video" ? "וידאו" : "תמונה";
        messageText = `[${msg.message_timestamp}] ${msg.sender_label}${msg.is_child_sender ? " (הילד/ה)" : ""}: [${mediaLabel}]`;
        if (msg.text_content) {
          messageText += ` כיתוב: ${msg.text_content}`;
        }
      }

      if (messageText) {
        textParts.push(messageText);
      }
    }

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
- תוכן לא נעים אך לא מסוכן

בנוסף, בדוק היטב את התמונות המצורפות - חפש תוכן לא הולם, סימני סיכון, או כל דבר חשוד.

החזר תשובה בפורמט JSON עם השדות הבאים:
- threatDetected: boolean - האם זוהה איום
- riskLevel: "low" | "medium" | "high" | "critical" | null
- threatTypes: string[] - סוגי האיומים
- triggers: array של אובייקטים עם messageId, type, preview, confidence
- patterns: array של אובייקטים עם chatId, patternType, description, confidence  
- explanation: string - הסבר קצר בעברית`;

    const userPrompt = `הודעות לניתוח:

${textParts.join("\n")}

${imageParts.length > 0 ? `\nמצורפות ${imageParts.length} תמונות לבדיקה.` : ""}

נתח את ההודעות וזהה סיכונים לפי ההנחיות. החזר JSON בלבד.`;

    // Build the content array for GPT Vision
    const contentArray: Array<{ type: string; text?: string; image_url?: { url: string; detail: string } }> = [
      { type: "text", text: userPrompt }
    ];

    // Add images
    for (const img of imageParts) {
      contentArray.push(img);
    }

    console.log(`Calling OpenAI Chat Completions API with ${imageParts.length} images...`);
    
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o", // Vision-capable model
        messages: [
          { role: "system", content: systemInstructions },
          { role: "user", content: contentArray }
        ],
        max_tokens: 2000,
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI Chat API error:", response.status, errorText);
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log("OpenAI Chat API result:", JSON.stringify(result, null, 2));

    // Extract the structured output from the response
    let analysisResult;
    try {
      const outputText = result.choices?.[0]?.message?.content;
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
