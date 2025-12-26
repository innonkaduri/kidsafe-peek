import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface FetchRequest {
  child_id: string;
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
  typeMessage?: string;
  chatId: string;
  senderId: string;
  senderName: string;
  textMessage?: string;
  caption?: string;
  fromMe?: boolean;
  // Media fields
  downloadUrl?: string;
  jpegThumbnail?: string;
  fileName?: string;
}

// Sanitize text to remove invalid UTF-8 sequences
function sanitizeText(text: string | null | undefined): string {
  if (!text) return "";
  return text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
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
  
  const supabaseAuth = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!
  );

  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
  
  if (authError || !user) {
    console.error("Auth error:", authError);
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Use service role client to verify ownership (bypasses RLS)
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: child, error: childError } = await supabaseAdmin
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

// Helper function to get Green API credentials for a specific child
async function getGreenApiCredentials(
  supabase: any,
  childId: string
): Promise<{ instanceId: string; apiToken: string } | null> {
  // First try to get per-child credentials
  const { data: cred } = await supabase
    .from("connector_credentials")
    .select("instance_id, api_token")
    .eq("child_id", childId)
    .eq("status", "authorized")
    .maybeSingle();

  if (cred && cred.instance_id && cred.api_token) {
    return { instanceId: cred.instance_id, apiToken: cred.api_token };
  }

  // Fallback to global credentials (legacy support)
  const instanceId = Deno.env.get("GREEN_API_INSTANCE_ID");
  const apiToken = Deno.env.get("GREEN_API_TOKEN");

  if (instanceId && apiToken) {
    return { instanceId, apiToken };
  }

  return null;
}

// Helper function for rate-limited API calls with retry
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      // If rate limited, wait and retry
      if (response.status === 429) {
        const waitTime = Math.pow(2, attempt) * 1000; // Exponential backoff: 1s, 2s, 4s
        console.log(`Rate limited (429), waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries}`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`Fetch attempt ${attempt + 1} failed:`, lastError.message);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  throw lastError || new Error("Fetch failed after retries");
}

serve(async (req) => {
  console.log("=== green-api-fetch v6: with rate limiting protection ===");
  
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const MAX_EXECUTION_TIME = 40000; // 40 seconds max to leave more buffer
  
  const shouldContinue = () => {
    const elapsed = Date.now() - startTime;
    if (elapsed > MAX_EXECUTION_TIME) {
      console.log(`Timeout protection: stopping after ${elapsed}ms`);
      return false;
    }
    return true;
  };

  try {
    const { child_id }: FetchRequest = await req.json();
    console.log("Starting sync for child:", child_id);

    // Verify authentication and child ownership
    const authResult = await verifyAuthAndOwnership(req, child_id);
    if (authResult instanceof Response) {
      return authResult;
    }

    // Create service role client for database operations
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get Green API credentials for this child
    const credentials = await getGreenApiCredentials(supabase, child_id);
    
    if (!credentials) {
      console.error("No GREEN_API credentials found for child:", child_id);
      return new Response(
        JSON.stringify({ error: "WhatsApp not connected. Please connect first." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { instanceId, apiToken } = credentials;
    const baseUrl = `https://api.green-api.com/waInstance${instanceId}`;
    console.log("Using Green API instance:", instanceId);

    console.log("Fetching chats for child:", child_id, "instance:", instanceId);

    // Fetch recent chats with retry logic
    const chatsResponse = await fetchWithRetry(`${baseUrl}/getChats/${apiToken}`, {
      method: "GET",
    });

    if (!chatsResponse.ok) {
      const errorText = await chatsResponse.text();
      console.error("Green API error:", errorText);
      throw new Error(`Green API error: ${chatsResponse.status}`);
    }

    const chats: GreenAPIChat[] = await chatsResponse.json();

    let totalMessagesImported = 0;
    let totalChatsProcessed = 0;

    // Reduced to 5 chats to prevent rate limiting
    for (const chat of chats.slice(0, 5)) {
      try {
        const chatName = sanitizeText(chat.name || chat.id);

        // Find or create chat in database
        let { data: dbChat } = await supabase
          .from("chats")
          .select("id")
          .eq("child_id", child_id)
          .eq("chat_name", chatName)
          .maybeSingle();

        if (!dbChat) {
          const { data: newChat, error: chatError } = await supabase
            .from("chats")
            .insert({
              child_id,
              chat_name: chatName,
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

        // Add delay between chats to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Fetch messages for this chat with retry
        const messagesResponse = await fetchWithRetry(`${baseUrl}/getChatHistory/${apiToken}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId: chat.id, count: 30 }), // Reduced from 50
        });

        if (!messagesResponse.ok) {
          console.error(`Failed to fetch messages for chat ${chat.id}`);
          continue;
        }

        const messages: GreenAPIMessage[] = await messagesResponse.json();

        // Track media fetch count to limit API calls - reduced for timeout prevention
        let mediaFetchCount = 0;
        const MAX_MEDIA_PER_CHAT = 10; // Reduced from 50 to prevent timeout
        let debugLogCount = 0;

        console.log(`Processing ${messages.length} messages for chat ${chat.id}`);
        
        // Check timeout before processing messages
        if (!shouldContinue()) {
          console.log("Stopping due to timeout protection");
          break;
        }

        for (const msg of messages) {
          // Detect message type
          const messageType = msg.typeMessage || msg.type;
          const isMediaMessage = ["imageMessage", "audioMessage", "pttMessage", "videoMessage", "documentMessage", "stickerMessage"].includes(messageType);

          // Debug log first 3 media messages per chat
          if (isMediaMessage && debugLogCount < 3) {
            console.log(`DEBUG media msg: type=${messageType}, idMessage=${msg.idMessage || 'MISSING'}, chatId=${msg.chatId || 'MISSING'}, downloadUrl=${msg.downloadUrl || 'MISSING'}, keys=${Object.keys(msg).join(',')}`);
            debugLogCount++;
          }

          // For media messages without downloadUrl, fetch it using downloadFile API
          if (isMediaMessage && !msg.downloadUrl && mediaFetchCount < MAX_MEDIA_PER_CHAT && msg.idMessage) {
            try {
              // Use msg.chatId if available, fallback to chat.id
              const chatIdForDownload = msg.chatId || chat.id;
              console.log(`Fetching downloadUrl for ${msg.idMessage} (type: ${messageType}, chatId: ${chatIdForDownload})`);
              
              const downloadResponse = await fetchWithRetry(`${baseUrl}/downloadFile/${apiToken}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                  chatId: chatIdForDownload, 
                  idMessage: msg.idMessage 
                }),
              });

              const responseText = await downloadResponse.text();
              
              if (downloadResponse.ok) {
                try {
                  const downloadData = JSON.parse(responseText);
                  if (downloadData.downloadUrl) {
                    msg.downloadUrl = downloadData.downloadUrl;
                    console.log(`SUCCESS: Got downloadUrl for ${msg.idMessage}: ${downloadData.downloadUrl.substring(0, 100)}...`);
                  } else {
                    console.log(`No downloadUrl in response for ${msg.idMessage}. Response:`, responseText.substring(0, 200));
                  }
                } catch (parseError) {
                  console.log(`Failed to parse downloadFile response for ${msg.idMessage}:`, responseText.substring(0, 200));
                }
              } else {
                console.log(`downloadFile API failed for ${msg.idMessage}: status=${downloadResponse.status}, body=${responseText.substring(0, 200)}`);
              }
              
              mediaFetchCount++;
              // Reduced delay to prevent timeout
              await new Promise(resolve => setTimeout(resolve, 50));
            } catch (downloadError) {
              console.error(`Error fetching downloadUrl for ${msg.idMessage}:`, downloadError);
            }
          }

          // Log media result
          if (isMediaMessage) {
            console.log(`Media result: type=${messageType}, hasUrl=${!!msg.downloadUrl}, hasThumbnail=${!!msg.jpegThumbnail}`);
          }

          // Check if message already exists
          const { data: existingMsg } = await supabase
            .from("messages")
            .select("id, media_url")
            .eq("chat_id", dbChat.id)
            .eq("message_timestamp", new Date(msg.timestamp * 1000).toISOString())
            .maybeSingle();

          // If message exists but missing media_url, update it
          if (existingMsg) {
            if (!existingMsg.media_url && msg.downloadUrl) {
              console.log(`Updating existing message ${existingMsg.id} with media_url`);
              await supabase.from("messages")
                .update({
                  media_url: msg.downloadUrl,
                  media_thumbnail_url: msg.jpegThumbnail || null,
                })
                .eq("id", existingMsg.id);
            }
            continue;
          }

          let msgType = "text";
          let textContent = sanitizeText(msg.textMessage || msg.caption || "");

          // Detect message type from type or typeMessage field
          const msgTypeDetect = msg.typeMessage || msg.type;
          if (msgTypeDetect === "imageMessage") msgType = "image";
          else if (msgTypeDetect === "audioMessage" || msgTypeDetect === "pttMessage") msgType = "audio";
          else if (msgTypeDetect === "videoMessage") msgType = "video";
          else if (msgTypeDetect === "documentMessage") msgType = "file";
          else if (msgTypeDetect === "stickerMessage") msgType = "sticker";

          // Detect outgoing messages: fromMe=true or type="outgoing"
          const isOutgoing = msg.fromMe === true || msg.type === "outgoing";
          const senderLabel = isOutgoing ? "אני" : sanitizeText(msg.senderName || msg.senderId);

          await supabase.from("messages").insert({
            child_id,
            chat_id: dbChat.id,
            sender_label: senderLabel,
            is_child_sender: isOutgoing,
            msg_type: msgType,
            message_timestamp: new Date(msg.timestamp * 1000).toISOString(),
            text_content: textContent,
            text_excerpt: textContent.substring(0, 100),
            media_url: msg.downloadUrl || null,
            media_thumbnail_url: msg.jpegThumbnail || null,
          });

          totalMessagesImported++;
        }

        totalChatsProcessed++;
        
        // Check timeout after each chat
        if (!shouldContinue()) {
          console.log("Stopping chat loop due to timeout protection");
          break;
        }
      } catch (chatError) {
        console.error(`Error processing chat ${chat.id}:`, chatError);
      }
    }

    console.log("Sync complete:", totalChatsProcessed, "chats,", totalMessagesImported, "messages");

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
