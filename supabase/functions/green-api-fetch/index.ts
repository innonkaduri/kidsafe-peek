import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface FetchRequest {
  child_id: string;
  instance_id: string;
  api_token: string;
}

interface GreenAPIChat {
  id: string;
  name: string;
  type: string;
  lastMessageTime: number;
}

interface GreenAPIMessage {
  idMessage: string;
  timestamp: number;
  type: string;
  chatId: string;
  senderId: string;
  senderName: string;
  textMessage?: string;
  caption?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { child_id, instance_id, api_token }: FetchRequest = await req.json();

    console.log(`Fetching messages for child ${child_id} from Green API instance ${instance_id}`);

    const baseUrl = `https://api.green-api.com/waInstance${instance_id}`;

    // Fetch recent chats
    const chatsResponse = await fetch(`${baseUrl}/getChats/${api_token}`, {
      method: "GET",
    });

    if (!chatsResponse.ok) {
      const errorText = await chatsResponse.text();
      console.error("Green API error:", errorText);
      throw new Error(`Green API error: ${chatsResponse.status}`);
    }

    const chats: GreenAPIChat[] = await chatsResponse.json();
    console.log(`Found ${chats.length} chats`);

    let totalMessagesImported = 0;
    let totalChatsProcessed = 0;

    for (const chat of chats.slice(0, 20)) { // Limit to 20 most recent chats
      try {
        // Find or create chat in database
        let { data: dbChat } = await supabase
          .from("chats")
          .select("id")
          .eq("child_id", child_id)
          .eq("chat_name", chat.name || chat.id)
          .maybeSingle();

        if (!dbChat) {
          const { data: newChat, error: chatError } = await supabase
            .from("chats")
            .insert({
              child_id,
              chat_name: chat.name || chat.id,
              participant_count: 2,
              is_group: chat.type === "group",
              last_message_at: chat.lastMessageTime 
                ? new Date(chat.lastMessageTime * 1000).toISOString() 
                : null,
            })
            .select("id")
            .single();

          if (chatError) {
            console.error("Error creating chat:", chatError);
            continue;
          }
          dbChat = newChat;
        }

        // Fetch messages for this chat
        const messagesResponse = await fetch(`${baseUrl}/getChatHistory/${api_token}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId: chat.id, count: 50 }),
        });

        if (!messagesResponse.ok) {
          console.error(`Failed to fetch messages for chat ${chat.id}`);
          continue;
        }

        const messages: GreenAPIMessage[] = await messagesResponse.json();

        for (const msg of messages) {
          // Check if message already exists
          const { data: existingMsg } = await supabase
            .from("messages")
            .select("id")
            .eq("chat_id", dbChat.id)
            .eq("message_timestamp", new Date(msg.timestamp * 1000).toISOString())
            .eq("sender_label", msg.senderName || msg.senderId)
            .maybeSingle();

          if (existingMsg) continue; // Skip existing messages

          let msgType = "text";
          let textContent = msg.textMessage || msg.caption || "";

          if (msg.type === "imageMessage") msgType = "image";
          else if (msg.type === "audioMessage" || msg.type === "pttMessage") msgType = "audio";
          else if (msg.type === "videoMessage") msgType = "video";
          else if (msg.type === "documentMessage") msgType = "file";

          await supabase.from("messages").insert({
            child_id,
            chat_id: dbChat.id,
            sender_label: msg.senderName || msg.senderId,
            is_child_sender: false, // Will need to determine based on phone number
            msg_type: msgType,
            message_timestamp: new Date(msg.timestamp * 1000).toISOString(),
            text_content: textContent,
            text_excerpt: textContent.substring(0, 100),
          });

          totalMessagesImported++;
        }

        totalChatsProcessed++;
      } catch (chatError) {
        console.error(`Error processing chat ${chat.id}:`, chatError);
      }
    }

    console.log(`Import complete: ${totalChatsProcessed} chats, ${totalMessagesImported} messages`);

    return new Response(
      JSON.stringify({
        success: true,
        chatsProcessed: totalChatsProcessed,
        messagesImported: totalMessagesImported,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in green-api-fetch:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
