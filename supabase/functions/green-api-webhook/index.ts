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

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const webhookData: GreenAPIMessage = await req.json();

    // Only process incoming messages
    if (webhookData.typeWebhook !== "incomingMessageReceived") {
      return new Response(JSON.stringify({ status: "ignored" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const instanceId = webhookData.instanceData.idInstance.toString();

    // Find the data source and child associated with this instance
    // First try to match by instance_id in connector_credentials (per-child credentials)
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
      // Fallback: check if this matches our global instance
      const expectedInstanceId = Deno.env.get("GREEN_API_INSTANCE_ID");
      
      if (expectedInstanceId && instanceId !== expectedInstanceId) {
        // This webhook is from an unknown instance - reject it
        console.error("Webhook from unknown instance:", instanceId);
        return new Response(JSON.stringify({ status: "unknown_instance" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      // For global instance, find any child with connector data source
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
    const typeMessage = msgData?.typeMessage;

    // Green API sends file payloads under the specific *Message field (not consistently under fileMessageData)
    const getFileData = (): FileMessageData | undefined => {
      if (typeMessage === "imageMessage") return msgData.imageMessage;
      if (typeMessage === "videoMessage") return msgData.videoMessage;
      if (typeMessage === "audioMessage") return msgData.audioMessage;
      if (typeMessage === "documentMessage") return msgData.documentMessage;
      return msgData.fileMessageData;
    };

    const fileData = getFileData();

    if (typeMessage === "textMessage" && msgData.textMessageData) {
      msgType = "text";
      textContent = msgData.textMessageData.textMessage;
    } else if (typeMessage === "extendedTextMessage" && msgData.extendedTextMessageData) {
      msgType = "text";
      textContent = msgData.extendedTextMessageData.text;
    } else if (typeMessage === "imageMessage") {
      msgType = "image";
      textContent = fileData?.caption || "";
      mediaUrl = fileData?.downloadUrl || null;
      mediaThumbnailUrl = fileData?.jpegThumbnail
        ? `data:image/jpeg;base64,${fileData.jpegThumbnail}`
        : null;
    } else if (typeMessage === "videoMessage") {
      msgType = "video";
      textContent = fileData?.caption || "";
      mediaUrl = fileData?.downloadUrl || null;
      mediaThumbnailUrl = fileData?.jpegThumbnail
        ? `data:image/jpeg;base64,${fileData.jpegThumbnail}`
        : null;
    } else if (typeMessage === "audioMessage") {
      msgType = "audio";
      mediaUrl = fileData?.downloadUrl || null;
    } else if (typeMessage === "documentMessage") {
      msgType = "file";
      textContent = fileData?.fileName || fileData?.caption || "";
      mediaUrl = fileData?.downloadUrl || null;
    } else if (typeMessage === "stickerMessage") {
      msgType = "sticker";
      mediaUrl = fileData?.downloadUrl || null;
    }

    const payload = {
      child_id: childId,
      chat_id: chat.id,
      sender_label: webhookData.senderData.senderName || webhookData.senderData.sender,
      is_child_sender: false, // incoming messages are not from the child
      msg_type: msgType,
      message_timestamp: new Date(webhookData.timestamp * 1000).toISOString(),
      text_content: textContent,
      text_excerpt: (textContent || "").slice(0, 100),
      media_url: mediaUrl,
      media_thumbnail_url: mediaThumbnailUrl,
    };

    // Insert as an array to avoid intermittent "Empty or invalid json" issues seen in PostgREST
    const { error: msgError } = await supabase.from("messages").insert([payload]);

    if (msgError) {
      console.error("Error inserting message:", msgError);
      throw msgError;
    }

    // Update chat last message time
    await supabase
      .from("chats")
      .update({ last_message_at: new Date(webhookData.timestamp * 1000).toISOString() })
      .eq("id", chat.id);

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
