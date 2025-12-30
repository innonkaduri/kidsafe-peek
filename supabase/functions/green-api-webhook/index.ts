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

// Sanitize text to remove invalid UTF-8 sequences (broken surrogates) and other problematic characters
function sanitizeText(text: string | null | undefined): string {
  if (!text) return "";
  // Remove unpaired surrogates which cause PostgreSQL JSON errors
  // Also remove other problematic Unicode characters
  return text
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, "") // Remove high surrogates without low
    .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "") // Remove low surrogates without high
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") // Remove control characters except \t \n \r
    .replace(/\uFFFE|\uFFFF/g, ""); // Remove non-characters
}

// Safely sanitize base64 thumbnail - return null if it might cause issues
function sanitizeThumbnail(thumbnail: string | null | undefined): string | null {
  if (!thumbnail) return null;
  // Skip thumbnails that are too large (>50KB base64) or might contain broken data
  if (thumbnail.length > 70000) return null;
  // Check if it looks like valid base64
  if (!/^[A-Za-z0-9+/=]+$/.test(thumbnail)) return null;
  return thumbnail;
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

    // Parse webhook data
    let webhookData: GreenAPIMessage;
    try {
      webhookData = await req.json();
    } catch (parseError) {
      console.error("Failed to parse webhook JSON:", parseError);
      return new Response(JSON.stringify({ error: "Invalid JSON payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate required webhook structure
    if (!webhookData.instanceData || !webhookData.instanceData.idInstance) {
      console.error("Invalid webhook structure - missing instanceData");
      return new Response(JSON.stringify({ error: "Invalid webhook structure" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const instanceId = webhookData.instanceData.idInstance.toString();

    console.log("Webhook received:", webhookData.typeWebhook, "instance:", instanceId);

    // SECURITY: Verify that the instanceId belongs to a registered credential
    // This prevents attackers from sending fake webhooks with arbitrary instance IDs
    const { data: validCredential, error: credError } = await supabase
      .from("connector_credentials")
      .select("id, child_id, status")
      .eq("instance_id", instanceId)
      .maybeSingle();

    if (credError) {
      console.error("Error verifying instance credential:", credError);
      return new Response(JSON.stringify({ error: "Database error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!validCredential) {
      console.warn("SECURITY: Webhook from unregistered instance:", instanceId);
      // Return 200 to avoid revealing instance validation to attackers
      // But don't process the webhook
      return new Response(JSON.stringify({ status: "ignored" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Verified webhook from instance:", instanceId, "for child:", validCredential.child_id);

    // Handle state change webhooks (connection status)
    if (webhookData.typeWebhook === "stateInstanceChanged") {
      const newState = webhookData.stateInstance;
      console.log("State changed to:", newState, "for instance:", instanceId);

      // Use the already verified credential
      const cred = validCredential;
      
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

    // Use the already verified child_id from the credential
    const childId: string = childIdFromQuery || validCredential.child_id;

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

    // Supported message types for database CHECK CONSTRAINT
    const VALID_MSG_TYPES = ['text', 'image', 'audio', 'video', 'file', 'sticker', 'reaction', 'quote', 'ptt', 'location', 'contact', 'vcard', 'poll', 'call_log'];

    if (typeMessage === "textMessage" && msgData?.textMessageData) {
      msgType = "text";
      textContent = sanitizeText(msgData.textMessageData.textMessage);
    } else if (typeMessage === "extendedTextMessage" && msgData?.extendedTextMessageData) {
      msgType = "text";
      textContent = sanitizeText(msgData.extendedTextMessageData.text);
    } else if (typeMessage === "quotedMessage" && msgData?.extendedTextMessageData) {
      // Reply/quote message - extract text from extendedTextMessageData
      msgType = "quote";
      textContent = sanitizeText(msgData.extendedTextMessageData.text);
    } else if (typeMessage === "reactionMessage") {
      // Reaction message (like/emoji)
      msgType = "reaction";
      textContent = sanitizeText((msgData as any)?.reactionMessageData?.reaction || (msgData as any)?.extendedTextMessageData?.text || "👍");
    } else if (typeMessage === "imageMessage") {
      msgType = "image";
      textContent = sanitizeText(fileData?.caption);
      mediaUrl = fileData?.downloadUrl || null;
      // Use sanitized thumbnail to avoid Unicode errors
      const safeThumbnail = sanitizeThumbnail(fileData?.jpegThumbnail);
      mediaThumbnailUrl = safeThumbnail ? `data:image/jpeg;base64,${safeThumbnail}` : null;
      console.log("Image message - mediaUrl:", mediaUrl);
    } else if (typeMessage === "videoMessage") {
      msgType = "video";
      textContent = sanitizeText(fileData?.caption);
      mediaUrl = fileData?.downloadUrl || null;
      // Use sanitized thumbnail to avoid Unicode errors
      const safeThumbnail = sanitizeThumbnail(fileData?.jpegThumbnail);
      mediaThumbnailUrl = safeThumbnail ? `data:image/jpeg;base64,${safeThumbnail}` : null;
      console.log("Video message - mediaUrl:", mediaUrl);
    } else if (typeMessage === "audioMessage") {
      msgType = "audio";
      mediaUrl = fileData?.downloadUrl || null;
      console.log("Audio message - mediaUrl:", mediaUrl);
    } else if (typeMessage === "pttMessage" || typeMessage === "voiceMessage") {
      // Push-to-talk / voice message
      msgType = "ptt";
      mediaUrl = fileData?.downloadUrl || null;
      console.log("PTT message - mediaUrl:", mediaUrl);
    } else if (typeMessage === "documentMessage") {
      msgType = "file";
      textContent = sanitizeText(fileData?.fileName || fileData?.caption);
      mediaUrl = fileData?.downloadUrl || null;
    } else if (typeMessage === "stickerMessage") {
      msgType = "sticker";
      mediaUrl = fileData?.downloadUrl || null;
    } else if (typeMessage === "locationMessage") {
      msgType = "location";
      const locData = (msgData as any)?.locationMessageData;
      textContent = locData ? `${locData.latitude || ""},${locData.longitude || ""}` : "";
    } else if (typeMessage === "contactMessage" || typeMessage === "vcardMessage" || typeMessage === "contactsArrayMessage") {
      msgType = "contact";
      const contactData = (msgData as any)?.contactMessageData || (msgData as any)?.contactsArrayMessageData;
      textContent = sanitizeText(contactData?.displayName || contactData?.contacts?.[0]?.displayName || "איש קשר");
    } else if (typeMessage === "pollMessage") {
      msgType = "poll";
      const pollData = (msgData as any)?.pollMessageData;
      textContent = sanitizeText(pollData?.name || "סקר");
    } else if (typeMessage === "callLogMessage") {
      msgType = "call_log";
      textContent = "שיחה";
    } else {
      // Unknown type - fallback to text to avoid CHECK CONSTRAINT violation
      console.log("Unknown message type:", typeMessage, "- saving as text");
      msgType = "text";
      textContent = textContent || `[${typeMessage || "הודעה"}]`;
    }

    // Safety check: ensure msgType is valid (should not happen, but just in case)
    if (!VALID_MSG_TYPES.includes(msgType)) {
      console.warn("Invalid msgType after processing:", msgType, "- defaulting to text");
      msgType = "text";
    }

    const senderLabel = sanitizeText(webhookData.senderData.senderName || webhookData.senderData.sender);

    // For outgoing messages, the sender is the child
    const isChildSender = isOutgoing;

    // Use idMessage from Green API as unique external ID to prevent duplicates
    const externalMessageId = webhookData.idMessage || null;

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
      external_message_id: externalMessageId,
    };

    // Use upsert with ignoreDuplicates to prevent duplicate messages
    let { error: msgError } = await supabase.from("messages").upsert([payload], {
      onConflict: 'external_message_id',
      ignoreDuplicates: true
    });

    // If insert fails with Unicode/JSON error, retry without thumbnail
    if (msgError && msgError.code === "22P02") {
      console.warn("Insert failed with JSON error, retrying without thumbnail...");
      const payloadWithoutThumbnail = { ...payload, media_thumbnail_url: null };
      const retryResult = await supabase.from("messages").insert([payloadWithoutThumbnail]);
      msgError = retryResult.error;
      
      // If still failing, try without text content too
      if (msgError && msgError.code === "22P02") {
        console.warn("Retry failed, trying with minimal payload...");
        const minimalPayload = { 
          ...payloadWithoutThumbnail, 
          text_content: sanitizeText(textContent.slice(0, 500)), // Truncate
          text_excerpt: sanitizeText(textContent.slice(0, 50))
        };
        const finalResult = await supabase.from("messages").insert([minimalPayload]);
        msgError = finalResult.error;
      }
    }

    if (msgError) {
      console.error("Error inserting message after retries:", msgError);
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
