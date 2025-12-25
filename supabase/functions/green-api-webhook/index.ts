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
  idMessage?: string;
  senderData?: {
    chatId: string;
    chatName: string;
    sender: string;
    senderName: string;
    senderContactName?: string;
  };
  messageData?: {
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
  stateInstance?: string; // For state webhooks
}

// Sanitize text to remove invalid UTF-8 sequences (broken surrogates)
function sanitizeText(text: string | null | undefined): string {
  if (!text) return "";
  // Remove unpaired surrogates which cause PostgreSQL JSON errors
  return text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
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

    // Get child_id from query params (for multi-instance setup)
    const url = new URL(req.url);
    const childIdFromQuery = url.searchParams.get("child_id");

    const webhookData: GreenAPIMessage = await req.json();
    const instanceId = webhookData.instanceData.idInstance.toString();

    console.log("Webhook received:", webhookData.typeWebhook, "instance:", instanceId);

    // Handle state change webhooks (connection status)
    if (webhookData.typeWebhook === "stateInstanceChanged") {
      const newState = webhookData.stateInstance;
      console.log("State changed to:", newState, "for instance:", instanceId);

      // Find the credential for this instance
      const { data: cred } = await supabase
        .from("connector_credentials")
        .select("id, child_id, status")
        .eq("instance_id", instanceId)
        .maybeSingle();

      if (cred) {
        if (newState === "authorized") {
          // Update status to authorized
          await supabase
            .from("connector_credentials")
            .update({ status: "authorized", last_checked_at: new Date().toISOString() })
            .eq("id", cred.id);
          console.log("Updated status to authorized for child:", cred.child_id);
        } else if (newState === "notAuthorized" || newState === "sleeping") {
          // Only delete if the instance was previously authorized (user disconnected)
          // Don't delete if status is still 'pending' - user hasn't scanned QR yet
          if (cred.status === "authorized") {
            console.log("User disconnected after being authorized, deleting for child:", cred.child_id);
            
            // Delete from partner API
            const partnerToken = Deno.env.get("GREEN_API_PARTNER_TOKEN");
            const partnerUrl = Deno.env.get("GREEN_API_PARTNER_URL") || "https://api.green-api.com";
            
            if (partnerToken) {
              try {
                await fetch(`${partnerUrl}/partner/deleteInstanceAccount/${partnerToken}`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ idInstance: parseInt(instanceId) }),
                });
                console.log("Instance deleted from Green API");
              } catch (e) {
                console.error("Failed to delete instance from Green API:", e);
              }
            }

            // Delete credential from DB
            await supabase.from("connector_credentials").delete().eq("id", cred.id);
            console.log("Credential deleted from DB");
          } else {
            // Instance is still pending - waiting for QR scan, don't delete
            console.log("Instance still pending (status:", cred.status, "), waiting for QR scan");
          }
        }
      }

      return new Response(JSON.stringify({ status: "state_processed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Process both incoming and outgoing messages
    const isIncoming = webhookData.typeWebhook === "incomingMessageReceived";
    const isOutgoing = webhookData.typeWebhook === "outgoingMessageReceived" || 
                       webhookData.typeWebhook === "outgoingAPIMessageReceived" ||
                       webhookData.typeWebhook === "outgoingMessageStatus";
    
    if (!isIncoming && !isOutgoing) {
      return new Response(JSON.stringify({ status: "ignored" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // For outgoingMessageStatus - only process "sent" or "delivered" statuses
    if (webhookData.typeWebhook === "outgoingMessageStatus") {
      // Skip status updates, we only want actual message content
      return new Response(JSON.stringify({ status: "ignored_status" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Processing message - type:", webhookData.typeWebhook, "isOutgoing:", isOutgoing);

    // Find the child for this instance
    let childId: string | null = childIdFromQuery;

    if (!childId) {
      // Look up by instance_id in connector_credentials
      const { data: cred } = await supabase
        .from("connector_credentials")
        .select("child_id")
        .eq("instance_id", instanceId)
        .maybeSingle();

      if (cred) {
        childId = cred.child_id;
      }
    }

    if (!childId) {
      console.error("No child found for instance:", instanceId);
      return new Response(JSON.stringify({ status: "no_child" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!webhookData.senderData) {
      console.error("No sender data in webhook");
      return new Response(JSON.stringify({ status: "no_sender_data" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const chatName = sanitizeText(
      webhookData.senderData.senderContactName || 
      webhookData.senderData.senderName || 
      webhookData.senderData.chatName
    );
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

    // Log raw message data for debugging media issues
    console.log("Message type:", typeMessage, "Full messageData:", JSON.stringify(msgData));

    // Green API uses fileMessageData for all media types
    // Also check type-specific properties as fallback
    const getFileData = (): FileMessageData | undefined => {
      // Primary: fileMessageData (used by Green API for all media)
      if (msgData?.fileMessageData) return msgData.fileMessageData;
      // Fallbacks for type-specific properties
      if (typeMessage === "imageMessage" && msgData?.imageMessage) return msgData.imageMessage;
      if (typeMessage === "videoMessage" && msgData?.videoMessage) return msgData.videoMessage;
      if (typeMessage === "audioMessage" && msgData?.audioMessage) return msgData.audioMessage;
      if (typeMessage === "documentMessage" && msgData?.documentMessage) return msgData.documentMessage;
      return undefined;
    };

    const fileData = getFileData();
    
    // Log extracted file data
    if (fileData) {
      console.log("Extracted fileData:", JSON.stringify(fileData));
    }

    if (typeMessage === "textMessage" && msgData?.textMessageData) {
      msgType = "text";
      textContent = sanitizeText(msgData.textMessageData.textMessage);
    } else if (typeMessage === "extendedTextMessage" && msgData?.extendedTextMessageData) {
      msgType = "text";
      textContent = sanitizeText(msgData.extendedTextMessageData.text);
    } else if (typeMessage === "imageMessage") {
      msgType = "image";
      textContent = sanitizeText(fileData?.caption);
      mediaUrl = fileData?.downloadUrl || null;
      mediaThumbnailUrl = fileData?.jpegThumbnail
        ? `data:image/jpeg;base64,${fileData.jpegThumbnail}`
        : null;
      console.log("Image message - mediaUrl:", mediaUrl);
    } else if (typeMessage === "videoMessage") {
      msgType = "video";
      textContent = sanitizeText(fileData?.caption);
      mediaUrl = fileData?.downloadUrl || null;
      mediaThumbnailUrl = fileData?.jpegThumbnail
        ? `data:image/jpeg;base64,${fileData.jpegThumbnail}`
        : null;
      console.log("Video message - mediaUrl:", mediaUrl);
    } else if (typeMessage === "audioMessage") {
      msgType = "audio";
      mediaUrl = fileData?.downloadUrl || null;
      console.log("Audio message - mediaUrl:", mediaUrl);
    } else if (typeMessage === "documentMessage") {
      msgType = "file";
      textContent = sanitizeText(fileData?.fileName || fileData?.caption);
      mediaUrl = fileData?.downloadUrl || null;
    } else if (typeMessage === "stickerMessage") {
      msgType = "sticker";
      mediaUrl = fileData?.downloadUrl || null;
    }

    const senderLabel = sanitizeText(webhookData.senderData.senderName || webhookData.senderData.sender);

    // For outgoing messages, the sender is the child
    const isChildSender = isOutgoing;

    const payload = {
      child_id: childId,
      chat_id: chat.id,
      sender_label: isChildSender ? "אני" : senderLabel,
      is_child_sender: isChildSender,
      msg_type: msgType,
      message_timestamp: new Date(webhookData.timestamp * 1000).toISOString(),
      text_content: textContent,
      text_excerpt: textContent.slice(0, 100),
      media_url: mediaUrl,
      media_thumbnail_url: mediaThumbnailUrl,
    };

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

    console.log("Message saved for child:", childId, "- isChildSender:", isChildSender);

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
