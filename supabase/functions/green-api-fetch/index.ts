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
  chatId: string;
  senderId: string;
  senderName: string;
  textMessage?: string;
  caption?: string;
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

// Helper function to get Green API credentials
function getGreenApiCredentials(): { instanceId: string; apiToken: string } | null {
  const instanceId = Deno.env.get("GREEN_API_INSTANCE_ID");
  const apiToken = Deno.env.get("GREEN_API_TOKEN");

  if (instanceId && apiToken) {
    return { instanceId, apiToken };
  }

  return null;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { child_id }: FetchRequest = await req.json();

    // Verify authentication and child ownership
    const authResult = await verifyAuthAndOwnership(req, child_id);
    if (authResult instanceof Response) {
      return authResult;
    }

    const { userId } = authResult;

    // Get Green API credentials
    const credentials = getGreenApiCredentials();
    
    if (!credentials) {
      console.error("Missing GREEN_API credentials");
      return new Response(
        JSON.stringify({ error: "Missing Green API credentials" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { instanceId, apiToken } = credentials;

    // Create service role client for database operations
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const baseUrl = `https://api.green-api.com/waInstance${instanceId}`;

    // Fetch recent chats
    const chatsResponse = await fetch(`${baseUrl}/getChats/${apiToken}`, {
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
        const messagesResponse = await fetch(`${baseUrl}/getChatHistory/${apiToken}`, {
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
            is_child_sender: false,
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
