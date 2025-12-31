import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface FetchRequest {
  child_id: string;
  max_chats?: number; // Optional: limit chats to process
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

// Helper function for rate-limited API calls with retry and timeout
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3,
  timeoutMs = 15000
): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const waitTime = Math.min(Math.pow(2, attempt) * 2000, 10000);
        console.log(`Waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries}`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (response.status === 429) {
        const waitTime = Math.min(Math.pow(2, attempt + 1) * 3000, 15000);
        console.log(`Rate limited (429), waiting ${waitTime}ms before retry`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      
      if (response.status === 504) {
        console.log(`Gateway timeout (504), retrying ${attempt + 1}/${maxRetries}`);
        continue;
      }
      
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (lastError.name === 'AbortError') {
        console.error(`Fetch attempt ${attempt + 1} timed out after ${timeoutMs}ms`);
      } else {
        console.error(`Fetch attempt ${attempt + 1} failed:`, lastError.message);
      }
    }
  }
  
  throw lastError || new Error("Fetch failed after retries");
}

// Check if chat ID is valid (skip system/invalid chats)
function isValidChatId(chatId: string): boolean {
  if (!chatId) return false;
  if (chatId === "0@c.us" || chatId.startsWith("0@")) return false;
  if (chatId === "status@broadcast") return false;
  return true;
}

// Sort and prioritize chats: private chats first, then by recent activity
function prioritizeChats(chats: GreenAPIChat[]): GreenAPIChat[] {
  const validChats = chats.filter(chat => isValidChatId(chat.id));
  
  // Separate private chats and groups
  const privateChats = validChats.filter(c => c.id.endsWith('@c.us'));
  const groupChats = validChats.filter(c => c.id.endsWith('@g.us'));
  
  // Sort each by lastMessageTime (most recent first)
  const sortByTime = (a: GreenAPIChat, b: GreenAPIChat) => 
    (b.lastMessageTime || 0) - (a.lastMessageTime || 0);
  
  privateChats.sort(sortByTime);
  groupChats.sort(sortByTime);
  
  // Interleave: take from private and group alternately, prioritizing private
  const result: GreenAPIChat[] = [];
  let pIdx = 0, gIdx = 0;
  
  while (pIdx < privateChats.length || gIdx < groupChats.length) {
    // Take 2 private chats for every 1 group chat (prioritize private)
    if (pIdx < privateChats.length) result.push(privateChats[pIdx++]);
    if (pIdx < privateChats.length) result.push(privateChats[pIdx++]);
    if (gIdx < groupChats.length) result.push(groupChats[gIdx++]);
  }
  
  return result;
}

// Find or create chat by external_chat_id
async function findOrCreateChat(
  supabase: any,
  childId: string,
  externalChatId: string,
  chatName: string,
  isGroup: boolean,
  lastMessageTime: number | null
): Promise<{ id: string } | null> {
  // First try to find by external_chat_id
  let { data: dbChat } = await supabase
    .from("chats")
    .select("id, chat_name")
    .eq("child_id", childId)
    .eq("external_chat_id", externalChatId)
    .maybeSingle();

  if (dbChat) {
    // Update chat_name if it changed
    if (dbChat.chat_name !== chatName) {
      await supabase
        .from("chats")
        .update({ chat_name: chatName })
        .eq("id", dbChat.id);
    }
    return dbChat;
  }

  // Fallback: check if chat exists by chat_name (for backward compatibility)
  const { data: legacyChat } = await supabase
    .from("chats")
    .select("id")
    .eq("child_id", childId)
    .eq("chat_name", chatName)
    .is("external_chat_id", null)
    .maybeSingle();

  if (legacyChat) {
    // Update with external_chat_id
    await supabase
      .from("chats")
      .update({ external_chat_id: externalChatId })
      .eq("id", legacyChat.id);
    return legacyChat;
  }

  // Create new chat
  const { data: newChat, error: chatError } = await supabase
    .from("chats")
    .insert({
      child_id: childId,
      chat_name: chatName,
      external_chat_id: externalChatId,
      participant_count: 2,
      is_group: isGroup,
      last_message_at: lastMessageTime 
        ? new Date(lastMessageTime * 1000).toISOString() 
        : null,
    })
    .select("id")
    .single();

  if (chatError) {
    console.error("Error creating chat:", chatError);
    return null;
  }
  
  return newChat;
}

serve(async (req) => {
  console.log("=== green-api-fetch v7: scalable smart sync ===");
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const MAX_EXECUTION_TIME = 45000; // 45 seconds max
  
  const shouldContinue = () => {
    const elapsed = Date.now() - startTime;
    if (elapsed > MAX_EXECUTION_TIME) {
      console.log(`Timeout protection: stopping after ${elapsed}ms`);
      return false;
    }
    return true;
  };

  try {
    const { child_id, max_chats }: FetchRequest = await req.json();
    console.log("Starting sync for child:", child_id);

    const authResult = await verifyAuthAndOwnership(req, child_id);
    if (authResult instanceof Response) {
      return authResult;
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

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

    // Fetch all chats
    const chatsResponse = await fetchWithRetry(`${baseUrl}/getChats/${apiToken}`, {
      method: "GET",
    });

    if (!chatsResponse.ok) {
      const errorText = await chatsResponse.text();
      console.error("Green API error:", errorText);
      throw new Error(`Green API error: ${chatsResponse.status}`);
    }

    const allChats: GreenAPIChat[] = await chatsResponse.json();
    console.log(`Fetched ${allChats.length} total chats from Green API`);

    // Prioritize and limit chats
    const prioritizedChats = prioritizeChats(allChats);
    const MAX_CHATS = max_chats || 15; // Process up to 15 chats by default
    const chatsToProcess = prioritizedChats.slice(0, MAX_CHATS);
    
    console.log(`Processing ${chatsToProcess.length} chats (${prioritizedChats.filter(c => c.id.endsWith('@c.us')).length} private, ${prioritizedChats.filter(c => c.id.endsWith('@g.us')).length} groups)`);

    let totalMessagesImported = 0;
    let totalChatsProcessed = 0;
    const BATCH_SIZE = 5; // Process in batches
    const BATCH_DELAY = 3000; // 3 seconds between batches

    for (let batchStart = 0; batchStart < chatsToProcess.length; batchStart += BATCH_SIZE) {
      if (!shouldContinue()) {
        console.log("Stopping due to timeout protection");
        break;
      }

      const batch = chatsToProcess.slice(batchStart, batchStart + BATCH_SIZE);
      console.log(`Processing batch ${Math.floor(batchStart / BATCH_SIZE) + 1}: ${batch.length} chats`);

      for (const chat of batch) {
        if (!shouldContinue()) break;

        try {
          const chatName = sanitizeText(chat.name || chat.id);
          const externalChatId = chat.id; // Green API chat ID
          const isGroup = chat.type === "group" || chat.id.endsWith('@g.us');

          // Find or create chat by external_chat_id
          const dbChat = await findOrCreateChat(
            supabase,
            child_id,
            externalChatId,
            chatName,
            isGroup,
            chat.lastMessageTime
          );

          if (!dbChat) {
            console.error("Failed to find/create chat for:", chat.id);
            continue;
          }

          // Small delay between individual chats
          await new Promise(resolve => setTimeout(resolve, 1500));
          
          // Fetch messages with increased count for active chats
          const messagesResponse = await fetchWithRetry(`${baseUrl}/getChatHistory/${apiToken}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chatId: chat.id, count: 50 }), // Increased from 30
          });

          if (!messagesResponse.ok) {
            console.error(`Failed to fetch messages for chat ${chat.id}`);
            continue;
          }

          const messages: GreenAPIMessage[] = await messagesResponse.json();
          console.log(`Fetched ${messages.length} messages for ${chatName}`);
          
          // Log first message structure for debugging
          if (messages.length > 0) {
            console.log(`Sample message structure:`, JSON.stringify(messages[0], null, 2));
          }
          
          if (messages.length === 0) {
            totalChatsProcessed++;
            continue;
          }

          // Batch check existing messages by external_message_id
          const externalIds = messages
            .map(m => m.idMessage)
            .filter(Boolean);
          
          let existingIds = new Set<string>();
          if (externalIds.length > 0) {
            const { data: existingMessages } = await supabase
              .from("messages")
              .select("external_message_id")
              .in("external_message_id", externalIds);
            
            existingIds = new Set(
              (existingMessages || [])
                .map((m: any) => m.external_message_id)
                .filter(Boolean)
            );
          }

          // Prepare new messages
          const messagesToInsert: any[] = [];
          let mediaFetchCount = 0;
          const MAX_MEDIA_FETCHES = 5;

          for (const msg of messages) {
            // Skip if already exists
            if (msg.idMessage && existingIds.has(msg.idMessage)) {
              continue;
            }

            const msgTypeDetect = msg.typeMessage || msg.type;
            const isMediaMessage = ["imageMessage", "audioMessage", "pttMessage", "videoMessage", "documentMessage", "stickerMessage"].includes(msgTypeDetect);

            // Fetch media URL if needed
            if (isMediaMessage && !msg.downloadUrl && mediaFetchCount < MAX_MEDIA_FETCHES && msg.idMessage && shouldContinue()) {
              try {
                const chatIdForDownload = msg.chatId || chat.id;
                const downloadResponse = await fetch(`${baseUrl}/downloadFile/${apiToken}`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ chatId: chatIdForDownload, idMessage: msg.idMessage }),
                });
                
                if (downloadResponse.ok) {
                  const downloadData = await downloadResponse.json();
                  if (downloadData.downloadUrl) {
                    msg.downloadUrl = downloadData.downloadUrl;
                  }
                }
                mediaFetchCount++;
              } catch (e) {
                // Ignore media fetch errors
              }
            }

            let msgType = "text";
            if (msgTypeDetect === "imageMessage") msgType = "image";
            else if (msgTypeDetect === "audioMessage" || msgTypeDetect === "pttMessage") msgType = "audio";
            else if (msgTypeDetect === "videoMessage") msgType = "video";
            else if (msgTypeDetect === "documentMessage") msgType = "file";
            else if (msgTypeDetect === "stickerMessage") msgType = "sticker";

            const textContent = sanitizeText(msg.textMessage || msg.caption || "");
            
            // Enhanced outgoing message detection:
            // 1. fromMe is true (direct indicator)
            // 2. type is "outgoing" (case-insensitive)
            // 3. In private chats: no senderName means it's from the phone owner
            const msgTypeLower = (msg.type || "").toLowerCase();
            const isOutgoing = msg.fromMe === true || 
                               msgTypeLower === "outgoing" || 
                               (!isGroup && !msg.senderName && msg.senderId?.endsWith('@c.us'));
            
            // Log for debugging
            console.log(`Message: type="${msg.type}", fromMe=${msg.fromMe}, sender="${msg.senderName || msg.senderId}", isOutgoing=${isOutgoing}`);
            
            const senderLabel = isOutgoing ? "אני" : sanitizeText(msg.senderName || msg.senderId);

            messagesToInsert.push({
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
              external_message_id: msg.idMessage || null,
            });
          }

          // Insert new messages
          if (messagesToInsert.length > 0) {
            console.log(`Inserting ${messagesToInsert.length} new messages for ${chatName}`);
            
            const { error: insertError } = await supabase
              .from("messages")
              .insert(messagesToInsert);
            
            if (insertError) {
              if (insertError.message?.includes('duplicate') || insertError.code === '23505') {
                console.log("Some duplicates detected, continuing...");
              } else {
                console.error("Batch insert error:", insertError.message);
              }
            }
            totalMessagesImported += messagesToInsert.length;
          }

          // Update chat's last_message_at
          if (messages.length > 0) {
            const latestTimestamp = Math.max(...messages.map(m => m.timestamp || 0));
            if (latestTimestamp > 0) {
              await supabase
                .from("chats")
                .update({ last_message_at: new Date(latestTimestamp * 1000).toISOString() })
                .eq("id", dbChat.id);
            }
          }

          totalChatsProcessed++;
        } catch (chatError) {
          console.error(`Error processing chat ${chat.id}:`, chatError);
        }
      }

      // Delay between batches to avoid rate limiting
      if (batchStart + BATCH_SIZE < chatsToProcess.length && shouldContinue()) {
        console.log(`Waiting ${BATCH_DELAY}ms before next batch...`);
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
      }
    }

    const elapsedTime = Date.now() - startTime;
    console.log(`Sync complete in ${elapsedTime}ms: ${totalChatsProcessed} chats, ${totalMessagesImported} messages`);

    return new Response(
      JSON.stringify({
        success: true,
        chatsProcessed: totalChatsProcessed,
        messagesImported: totalMessagesImported,
        totalChatsAvailable: allChats.length,
        elapsedMs: elapsedTime,
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
