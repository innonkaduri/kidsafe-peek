import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Sample conversation data
const SAFE_MESSAGES = [
  "היי מה קורה?",
  "מה המצב בבית ספר?",
  "רוצה לשחק מחר?",
  "ראית את הסרט החדש?",
  "מה עשית היום?",
  "איזה שיעורי בית יש?",
  "בוא נלך לפארק אחרי הצהריים",
  "האם את יכולה לעזור לי בחשבון?",
  "המורה נתנה מבחן מפתיע",
  "אני אוהב את המשחק הזה!",
  "מתי יום ההולדת שלך?",
  "בוא נעשה שיחת וידאו",
  "ההורים שלי אמרו שאפשר",
  "נתראה מחר בבית ספר!",
  "תודה על העזרה!"
];

const SUSPICIOUS_MESSAGES = [
  { text: "אל תספר להורים שלך על זה", riskCodes: ["ISOLATION", "SECRETIVE"], riskScore: 65 },
  { text: "בוא ניפגש במקום סודי", riskCodes: ["MEETUP", "SECRETIVE"], riskScore: 75 },
  { text: "תשלח לי תמונה שלך", riskCodes: ["NUDES_REQUEST"], riskScore: 70 },
  { text: "אתה כל כך מיוחד, אף אחד לא מבין אותך כמוני", riskCodes: ["GROOMING", "MANIPULATION"], riskScore: 60 },
  { text: "זה יהיה הסוד שלנו בסדר?", riskCodes: ["SECRETIVE", "MANIPULATION"], riskScore: 55 },
  { text: "אם לא תעשה את זה אני אספר לכולם", riskCodes: ["EXTORTION"], riskScore: 80 },
  { text: "קנה לך משהו אם תיפגש איתי", riskCodes: ["GROOMING", "MEETUP"], riskScore: 70 },
  { text: "ההורים שלך לא מבינים אותך, נכון?", riskCodes: ["ISOLATION", "MANIPULATION"], riskScore: 50 }
];

function randomDate(daysBack: number): Date {
  const now = new Date();
  const randomDays = Math.floor(Math.random() * daysBack);
  const randomHours = Math.floor(Math.random() * 24);
  const randomMinutes = Math.floor(Math.random() * 60);
  return new Date(now.getTime() - (randomDays * 24 * 60 * 60 * 1000) - (randomHours * 60 * 60 * 1000) - (randomMinutes * 60 * 1000));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { child_id, num_chats = 3, messages_per_chat = 20 } = await req.json();

    if (!child_id) {
      return new Response(
        JSON.stringify({ error: 'child_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Generating sample data for child ${child_id}: ${num_chats} chats, ${messages_per_chat} messages each`);

    const createdChats: string[] = [];
    const createdMessages: string[] = [];
    const createdSignals: string[] = [];

    for (let c = 0; c < num_chats; c++) {
      const chatName = `שיחה לדוגמה ${c + 1}`;
      const isGroup = Math.random() > 0.7;
      
      // Create chat
      const { data: chat, error: chatError } = await supabase
        .from('chats')
        .insert({
          child_id,
          chat_name: chatName,
          is_group: isGroup,
          participant_count: isGroup ? Math.floor(Math.random() * 5) + 3 : 2
        })
        .select()
        .single();
      
      if (chatError) {
        console.error('Failed to create chat:', chatError);
        continue;
      }
      
      createdChats.push(chat.id);
      
      // Create messages
      const suspiciousRatio = 0.15; // 15% suspicious messages
      const messages: any[] = [];
      
      for (let m = 0; m < messages_per_chat; m++) {
        const timestamp = randomDate(7);
        const isChildSender = Math.random() > 0.5;
        
        let textContent: string;
        let isSuspicious = false;
        let suspiciousData: any = null;
        
        if (Math.random() < suspiciousRatio) {
          const suspicious = SUSPICIOUS_MESSAGES[Math.floor(Math.random() * SUSPICIOUS_MESSAGES.length)];
          textContent = suspicious.text;
          isSuspicious = true;
          suspiciousData = suspicious;
        } else {
          textContent = SAFE_MESSAGES[Math.floor(Math.random() * SAFE_MESSAGES.length)];
        }
        
        messages.push({
          chat_id: chat.id,
          child_id,
          text_content: textContent,
          sender_label: isChildSender ? 'הילד' : 'איש קשר',
          is_child_sender: isChildSender,
          msg_type: 'text',
          message_timestamp: timestamp.toISOString(),
          _suspicious: isSuspicious,
          _suspicious_data: suspiciousData
        });
      }
      
      // Sort by timestamp
      messages.sort((a, b) => new Date(a.message_timestamp).getTime() - new Date(b.message_timestamp).getTime());
      
      // Insert messages
      for (const msg of messages) {
        const { _suspicious, _suspicious_data, ...messageData } = msg;
        
        const { data: message, error: msgError } = await supabase
          .from('messages')
          .insert(messageData)
          .select()
          .single();
        
        if (msgError) {
          console.error('Failed to create message:', msgError);
          continue;
        }
        
        createdMessages.push(message.id);
        
        // Create signal for suspicious messages
        if (_suspicious && _suspicious_data) {
          const { error: signalError } = await supabase
            .from('small_signals')
            .insert({
              message_id: message.id,
              risk_score: _suspicious_data.riskScore,
              risk_codes: _suspicious_data.riskCodes,
              escalate: _suspicious_data.riskScore >= 60
            });
          
          if (!signalError) {
            createdSignals.push(message.id);
          }
        }
      }
      
      // Update chat with last message timestamp
      const lastMessage = messages[messages.length - 1];
      await supabase
        .from('chats')
        .update({ last_message_at: lastMessage.message_timestamp })
        .eq('id', chat.id);
      
      // Create scan checkpoint
      await supabase.from('scan_checkpoints').insert({
        chat_id: chat.id,
        last_scanned_at: new Date().toISOString(),
        last_activity_at: lastMessage.message_timestamp
      });
    }

    console.log(`Sample data created: ${createdChats.length} chats, ${createdMessages.length} messages, ${createdSignals.length} signals`);

    return new Response(
      JSON.stringify({
        success: true,
        created: {
          chats: createdChats.length,
          messages: createdMessages.length,
          signals: createdSignals.length
        },
        chat_ids: createdChats
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Generate sample data error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
