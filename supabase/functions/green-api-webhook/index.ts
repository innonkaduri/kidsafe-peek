import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GreenAPIMessage {
  typeWebhook: string;
  instanceData: {
    idInstance: number;
    wid: string;
    typeInstance: string;
  };
  timestamp: number;
  idMessage: string;
  senderData: {
    chatId: string;
    chatName: string;
    sender: string;
    senderName: string;
    senderContactName?: string;
  };
  messageData: {
    typeMessage: string;
    textMessageData?: {
      textMessage: string;
    };
    extendedTextMessageData?: {
      text: string;
    };
    imageMessage?: {
      caption?: string;
      jpegThumbnail?: string;
    };
    audioMessage?: {
      downloadUrl: string;
    };
  };
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

    const webhookData: GreenAPIMessage = await req.json();
    console.log("Received Green API webhook:", webhookData.typeWebhook);

    // Only process incoming messages
    if (webhookData.typeWebhook !== "incomingMessageReceived") {
      return new Response(JSON.stringify({ status: "ignored" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const instanceId = webhookData.instanceData.idInstance.toString();

    // Find the data source and child associated with this instance
    const { data: credential, error: credError } = await supabase
      .from("connector_credentials")
      .select(`
        id,
        data_source_id,
        data_sources!inner(
          id,
          child_id,
          children!inner(
            id,
            user_id
          )
        )
      `)
      .eq("instance_id", instanceId)
      .single();

    if (credError || !credential) {
      console.error("No matching credential found for instance:", instanceId);
      return new Response(JSON.stringify({ status: "no_credential" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const childId = (credential.data_sources as any).child_id;
    const chatId = webhookData.senderData.chatId;
    const chatName = webhookData.senderData.senderContactName || 
                     webhookData.senderData.senderName || 
                     webhookData.senderData.chatName;

    // Find or create chat
    let { data: chat, error: chatError } = await supabase
      .from("chats")
      .select("id")
      .eq("child_id", childId)
      .eq("chat_name", chatName)
      .maybeSingle();

    if (!chat) {
      const { data: newChat, error: newChatError } = await supabase
        .from("chats")
        .insert({
          child_id: childId,
          chat_name: chatName,
          participant_count: 2,
          is_group: chatId.includes("@g.us"),
          last_message_at: new Date(webhookData.timestamp * 1000).toISOString(),
        })
        .select("id")
        .single();

      if (newChatError) {
        console.error("Error creating chat:", newChatError);
        throw newChatError;
      }
      chat = newChat;
    }

    // Determine message type and content
    let msgType = "text";
    let textContent = "";
    
    const msgData = webhookData.messageData;
    if (msgData.textMessageData) {
      textContent = msgData.textMessageData.textMessage;
    } else if (msgData.extendedTextMessageData) {
      textContent = msgData.extendedTextMessageData.text;
    } else if (msgData.imageMessage) {
      msgType = "image";
      textContent = msgData.imageMessage.caption || "";
    } else if (msgData.audioMessage) {
      msgType = "audio";
    } else if (msgData.typeMessage === "videoMessage") {
      msgType = "video";
    } else if (msgData.typeMessage === "documentMessage") {
      msgType = "file";
    }

    // Insert message
    const { error: msgError } = await supabase.from("messages").insert({
      child_id: childId,
      chat_id: chat.id,
      sender_label: webhookData.senderData.senderName || webhookData.senderData.sender,
      is_child_sender: false, // Incoming messages are not from child
      msg_type: msgType,
      message_timestamp: new Date(webhookData.timestamp * 1000).toISOString(),
      text_content: textContent,
      text_excerpt: textContent.substring(0, 100),
    });

    if (msgError) {
      console.error("Error inserting message:", msgError);
      throw msgError;
    }

    // Update chat last message time
    await supabase
      .from("chats")
      .update({ last_message_at: new Date(webhookData.timestamp * 1000).toISOString() })
      .eq("id", chat.id);

    console.log("Message stored successfully for child:", childId);

    return new Response(JSON.stringify({ status: "ok" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error processing webhook:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
