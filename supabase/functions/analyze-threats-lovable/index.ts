import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// System Prompt for Gemini 3 Pro - Safety analysis engine
const SYSTEM_PROMPT = `אתה מנוע בטיחות לניתוח שיחות WhatsApp של קטינים. המטרה: לזהות רק מצבים מסוכנים באמת שעלולים להוביל לפגיעה ממשית (חרם/בריונות חמורה, סמים/אלכוהול, איומים ואלימות, ניצול/אלימות מינית, גזענות, סחיטה/איום).
אתה עובד בדיוק מקסימלי ומעדיף False Negative על False Positive: אם אין ודאות גבוהה – אל תיצור אלרט.

כללים קשיחים

להחזיר JSON בלבד, ללא טקסט נוסף, ללא Markdown.
אל תייצר אלרט על מילת מפתח בלבד; חייב הקשר ברור שמצביע על פגיעה/לחץ/איום/ניצול.

להחזיר alerts רק כשיש ראיות חזקות מתוך ההודעות/מדיה שסופקו.

אם זו פרסומת, ספאם, הודעת חדשות, קישור לקבוצה, "דילים", עדכוני עירייה/חדשות, או תוכן ניטרלי – זה לא אלרט.

סיווגים מותרים בלבד:

bullying_ostracism (חרם/בריונות חמורה/השפלה קשה/הסתה נגד הילד)

sexual_violence_or_exploitation (ניצול/אלימות מינית/פדופיליה/סחיטה מינית)

drugs_or_alcohol (שימוש/סחר/לחץ להשתמש, לא "דיון כללי")

threats_or_violence (איום אמין, תכנון אלימות, נשק בהקשר מאיים)

hate_speech (גזענות/שנאה כלפי קבוצה)

מדיה (תמונות/וידאו/אודיו):

נתח את המדיה אם היא מצורפת.

אל תמציא מה יש במדיה. אם המדיה לא ברורה – ציין זאת והימנע מאלרט אלא אם יש ראיות נוספות.

אם מופיע נשק/אלימות בתמונה: זה אלרט רק אם יש גם הקשר מאיים/כוונה/יעד, או נשק עם סיטואציה מסכנת (לא "תמונה של מוצר/איירסופט/צעצוע" בלי הקשר).

סף אלרט:

אל תייצר אלרט אם confidence < 0.90.

risk_score הוא 0–100 ומשקף חומרה+סבירות.

שמירה על פרטיות: אל תבקש מידע מזהה נוסף. אל תציע פעולות פוגעניות.

מיקוד בראיות: כל אלרט חייב לכלול ציטוטים קצרים של הטריגרים (preview) והפניות ל־message_id.

פורמט תשובה (חובה)

החזר אובייקט JSON במבנה:

{
  "threatDetected": boolean,
  "riskLevel": "low" | "medium" | "high" | "critical" | null,
  "threatTypes": string[],
  "alerts": [...],
  "explanation": string
}

אלרט בודד חייב לכלול:

{
  "chatId": string,
  "chatName": string,
  "type": string (אחד מסוגי האיום המותרים),
  "risk_score": number (0–100),
  "confidence": number (0–1, חייב להיות ≥0.90),
  "summary": string (משפט קצר),
  "triggers": [{ "messageId": string, "modality": "text"|"image"|"audio"|"video", "preview": string, "confidence": number }],
  "childIsTarget": boolean (האם הילד מותקף/מנוצל),
  "childIsAggressor": boolean (האם הילד תוקף/מאיים)
}

אם אין אלרטים:
threatDetected=false, riskLevel=null, threatTypes=[], alerts=[], explanation="לא זוהו סיכונים ממשיים בשיחות שנבדקו."`;

// Interface for formatted messages
interface FormattedMessage {
  messageId: string;
  timestamp: string;
  chatId: string;
  chatName: string;
  sender: string;
  direction: 'incoming' | 'outgoing';
  type: 'text' | 'image' | 'audio' | 'video';
  text?: string;
  caption?: string;
  mediaUrl?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { child_id, messages, child_context } = await req.json();
    
    console.log('[analyze-threats-lovable] Starting Gemini 3 Pro analysis');
    console.log('[analyze-threats-lovable] Child ID:', child_id);
    console.log('[analyze-threats-lovable] Messages count:', messages?.length || 0);
    console.log('[analyze-threats-lovable] Child context:', child_context);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Parse child context
    const childName = child_context?.match(/שם:\s*([^,]+)/)?.[1]?.trim() || 'לא ידוע';
    const childAge = child_context?.match(/גיל:\s*([^,]+)/)?.[1]?.trim() || 'לא ידוע';
    const scanDate = new Date().toISOString();

    // Format messages for analysis - group by chat
    const chatGroups: Record<string, FormattedMessage[]> = {};
    
    for (const msg of messages || []) {
      const chatId = msg.chat_id || 'unknown';
      const chatName = msg.chat_name || 'צ\'אט לא ידוע';
      
      if (!chatGroups[chatId]) {
        chatGroups[chatId] = [];
      }

      const formattedMsg: FormattedMessage = {
        messageId: msg.id,
        timestamp: msg.message_timestamp,
        chatId: chatId,
        chatName: chatName,
        sender: msg.sender_label || 'לא ידוע',
        direction: msg.is_child_sender ? 'outgoing' : 'incoming',
        type: msg.msg_type || 'text',
        text: msg.text_content || undefined,
        caption: msg.text_content && msg.msg_type !== 'text' ? msg.text_content : undefined,
        mediaUrl: msg.media_url || undefined,
      };

      chatGroups[chatId].push(formattedMsg);
    }

    // Build content parts for multimodal analysis
    const contentParts: any[] = [];

    // Build user prompt with data
    const formattedChats = Object.entries(chatGroups).map(([chatId, msgs]) => ({
      chatId,
      chatName: msgs[0]?.chatName || 'צ\'אט לא ידוע',
      messages: msgs.map(m => ({
        messageId: m.messageId,
        timestamp: m.timestamp,
        sender: m.sender,
        direction: m.direction,
        type: m.type,
        text: m.text,
        caption: m.caption,
        hasMedia: !!m.mediaUrl,
      })),
    }));

    const userPrompt = `נתונים לניתוח (אל תשתמש בשום מידע חיצוני מעבר למה שמופיע כאן).
מטרה: להחזיר JSON בלבד לפי הפורמט שב-System.

טווח ניתוח: הודעות אחרונות

ילד/ה:
name: ${childName}
age: ${childAge}
scan_date: ${scanDate}

הודעות ומדיה לניתוח (מסודר לפי chats).
שדות אפשריים לכל הודעה:
messageId, timestamp, chatId, chatName, sender, direction ("incoming"|"outgoing"), type ("text"|"image"|"audio"|"video"), text, caption, hasMedia

DATA:
${JSON.stringify(formattedChats, null, 2)}

כללים נוספים לדיוק:
- אם זה נראה כמו ספאם/דילים/חדשות/הודעות מערכת → אל תייצר אלרט.
- אל תסיק מסקנות מהודעה אחת קצרה ולא ברורה.
- אלרט רק אם יש סיכון ממשי וברור (confidence ≥ 0.90).
- החזר את ה-JSON במבנה שנדרש.`;

    contentParts.push({ type: "text", text: userPrompt });

    // Add images to content for multimodal analysis
    let imageCount = 0;
    const MAX_IMAGES = 20;

    for (const msg of messages || []) {
      if (msg.msg_type === 'image' && msg.media_url && imageCount < MAX_IMAGES) {
        try {
          contentParts.push({
            type: "image_url",
            image_url: { url: msg.media_url }
          });
          contentParts.push({
            type: "text",
            text: `[תמונה מהודעה ${msg.id} - נשלחה על ידי ${msg.sender_label || 'לא ידוע'} בצ'אט "${msg.chat_name || 'לא ידוע'}"]`
          });
          imageCount++;
          console.log(`[analyze-threats-lovable] Added image ${imageCount}: ${msg.media_url.substring(0, 50)}...`);
        } catch (e) {
          console.error('[analyze-threats-lovable] Error adding image:', e);
        }
      }
    }

    console.log('[analyze-threats-lovable] Content parts count:', contentParts.length);
    console.log('[analyze-threats-lovable] Images included:', imageCount);

    // Call Lovable AI Gateway with Gemini 3 Pro
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-pro-preview',
        messages: [
          {
            role: 'system',
            content: SYSTEM_PROMPT
          },
          {
            role: 'user',
            content: contentParts
          }
        ],
        max_tokens: 4000,
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
    console.log('[analyze-threats-lovable] Raw response received');

    const aiResponse = data.choices?.[0]?.message?.content;
    console.log('[analyze-threats-lovable] AI Response length:', aiResponse?.length);

    // Parse JSON from response
    let result;
    try {
      // Extract JSON from response if wrapped in markdown
      const jsonMatch = aiResponse?.match(/```json\s*([\s\S]*?)\s*```/) || 
                        aiResponse?.match(/```\s*([\s\S]*?)\s*```/) ||
                        [null, aiResponse];
      const jsonStr = jsonMatch[1] || aiResponse;
      result = JSON.parse(jsonStr.trim());
      console.log('[analyze-threats-lovable] Parsed result:', {
        threatDetected: result.threatDetected,
        riskLevel: result.riskLevel,
        alertsCount: result.alerts?.length || 0,
      });
    } catch (e) {
      console.error('[analyze-threats-lovable] JSON parse error:', e);
      console.log('[analyze-threats-lovable] Raw response:', aiResponse?.substring(0, 500));
      result = {
        threatDetected: false,
        riskLevel: null,
        threatTypes: [],
        alerts: [],
        explanation: 'שגיאה בפענוח תשובת AI: ' + (aiResponse?.substring(0, 200) || 'תשובה ריקה'),
        parse_error: true
      };
    }

    // Validate and sanitize the result
    const sanitizedResult = {
      threatDetected: result.threatDetected === true,
      riskLevel: ['low', 'medium', 'high', 'critical'].includes(result.riskLevel) ? result.riskLevel : null,
      threatTypes: Array.isArray(result.threatTypes) ? result.threatTypes : [],
      alerts: Array.isArray(result.alerts) ? result.alerts.filter((a: any) => 
        a.confidence >= 0.90 // Only keep alerts with confidence >= 0.90
      ) : [],
      explanation: result.explanation || 'לא זוהו סיכונים ממשיים',
    };

    // Update threatDetected based on filtered alerts
    if (sanitizedResult.alerts.length === 0) {
      sanitizedResult.threatDetected = false;
      sanitizedResult.riskLevel = null;
    }

    return new Response(JSON.stringify({
      success: true,
      model: 'google/gemini-3-pro-preview',
      provider: 'lovable-ai',
      messages_analyzed: messages?.length || 0,
      images_analyzed: imageCount,
      ...sanitizedResult
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
