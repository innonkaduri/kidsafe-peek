import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface FileMessageData {
  downloadUrl?: string;
  caption?: string;
  mimeType?: string;
  fileName?: string;
  jpegThumbnail?: string;
}

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
    imageMessage?: FileMessageData;
    videoMessage?: FileMessageData;
    audioMessage?: FileMessageData;
    documentMessage?: FileMessageData;
    fileMessageData?: FileMessageData;
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
    const expectedInstanceId = Deno.env.get("GREEN_API_INSTANCE_ID");

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

    // Verify this is our instance
    if (expectedInstanceId && instanceId !== expectedInstanceId) {
      console.log("Ignoring webhook from different instance:", instanceId);
      return new Response(JSON.stringify({ status: "wrong_instance" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find the data source and child associated with this instance
    // First try by instance_id in connector_credentials
    let childId: string | null = null;
    
    const { data: credential } = await supabase
      .from("connector_credentials")
      .select(`
        id,
        data_source_id,
        data_sources!inner(
          id,
          child_id
        )
      `)
      .eq("instance_id", instanceId)
      .maybeSingle();

    if (credential) {
      childId = (credential.data_sources as any).child_id;
    } else {
      // Fallback: find any child with connector data source (for global instance)
      const { data: anyDataSource } = await supabase
        .from("data_sources")
        .select("child_id")
        .eq("source_type", "connector")
        .limit(1)
        .maybeSingle();
      
      if (anyDataSource) {
        childId = anyDataSource.child_id;
      }
    }

    if (!childId) {
      console.error("No child found for this instance");
      return new Response(JSON.stringify({ status: "no_child" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const chatName = webhookData.senderData.senderContactName || 
                     webhookData.senderData.senderName || 
                     webhookData.senderData.chatName;
    const chatId = webhookData.senderData.chatId;

    // Find or create chat
    let { data: chat } = await supabase
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

    // Determine message type, content, and media URLs
    let msgType = "text";
    let textContent = "";
    let mediaUrl: string | null = null;
    let mediaThumbnailUrl: string | null = null;
    
    const msgData = webhookData.messageData;
    
    // Helper to extract media data from different message types
    const getMediaData = (): FileMessageData | null => {
      if (msgData.imageMessage) return msgData.imageMessage;
      if (msgData.videoMessage) return msgData.videoMessage;
      if (msgData.audioMessage) return msgData.audioMessage;
      if (msgData.documentMessage) return msgData.documentMessage;
      if (msgData.fileMessageData) return msgData.fileMessageData;
      return null;
    };

    if (msgData.textMessageData) {
      textContent = msgData.textMessageData.textMessage;
    } else if (msgData.extendedTextMessageData) {
      textContent = msgData.extendedTextMessageData.text;
    } else if (msgData.imageMessage) {
      msgType = "image";
      textContent = msgData.imageMessage.caption || "";
      mediaUrl = msgData.imageMessage.downloadUrl || null;
      mediaThumbnailUrl = msgData.imageMessage.jpegThumbnail 
        ? `data:image/jpeg;base64,${msgData.imageMessage.jpegThumbnail}` 
        : null;
    } else if (msgData.videoMessage) {
      msgType = "video";
      textContent = msgData.videoMessage.caption || "";
      mediaUrl = msgData.videoMessage.downloadUrl || null;
      mediaThumbnailUrl = msgData.videoMessage.jpegThumbnail 
        ? `data:image/jpeg;base64,${msgData.videoMessage.jpegThumbnail}` 
        : null;
    } else if (msgData.audioMessage) {
      msgType = "audio";
      mediaUrl = msgData.audioMessage.downloadUrl || null;
    } else if (msgData.documentMessage) {
      msgType = "file";
      textContent = msgData.documentMessage.fileName || "";
      mediaUrl = msgData.documentMessage.downloadUrl || null;
    }

    console.log(`Message type: ${msgType}, has media URL: ${!!mediaUrl}, has thumbnail: ${!!mediaThumbnailUrl}`);

    // Insert message with media URLs
    const { data: insertedMessage, error: msgError } = await supabase.from("messages").insert({
      child_id: childId,
      chat_id: chat.id,
      sender_label: webhookData.senderData.senderName || webhookData.senderData.sender,
      is_child_sender: false, // Incoming messages are not from child
      msg_type: msgType,
      message_timestamp: new Date(webhookData.timestamp * 1000).toISOString(),
      text_content: textContent,
      text_excerpt: textContent.substring(0, 100),
      media_url: mediaUrl,
      media_thumbnail_url: mediaThumbnailUrl,
    }).select('id').single();

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
