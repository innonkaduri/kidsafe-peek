import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FetchMessagesRequest {
  child_name?: string;
  chat_name?: string;
  child_id?: string;
  chat_id?: string;
  limit?: number;
  offset?: number;
}

interface MessageResponse {
  id: string;
  text_content: string | null;
  sender_label: string;
  message_timestamp: string;
  msg_type: string;
  is_child_sender: boolean | null;
  media_url: string | null;
  chat_name: string;
  child_name: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Support both GET (query params) and POST (body)
    let params: FetchMessagesRequest;
    
    if (req.method === 'GET') {
      const url = new URL(req.url);
      params = {
        child_name: url.searchParams.get('child_name') || undefined,
        chat_name: url.searchParams.get('chat_name') || undefined,
        child_id: url.searchParams.get('child_id') || undefined,
        chat_id: url.searchParams.get('chat_id') || undefined,
        limit: url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!) : 100,
        offset: url.searchParams.get('offset') ? parseInt(url.searchParams.get('offset')!) : 0,
      };
    } else if (req.method === 'POST') {
      params = await req.json();
      params.limit = params.limit || 100;
      params.offset = params.offset || 0;
    } else {
      return new Response(
        JSON.stringify({ success: false, error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Fetch messages request:', params);

    // Build the query
    let query = supabase
      .from('messages')
      .select(`
        id,
        text_content,
        sender_label,
        message_timestamp,
        msg_type,
        is_child_sender,
        media_url,
        chat:chats!inner(
          id,
          chat_name,
          child:children!inner(
            id,
            display_name
          )
        )
      `)
      .order('message_timestamp', { ascending: false })
      .range(params.offset!, params.offset! + params.limit! - 1);

    // Filter by child_id if provided
    if (params.child_id) {
      query = query.eq('child_id', params.child_id);
    }

    // Filter by chat_id if provided
    if (params.chat_id) {
      query = query.eq('chat_id', params.chat_id);
    }

    // Filter by child_name (partial match, case-insensitive)
    if (params.child_name) {
      query = query.ilike('chat.child.display_name', `%${params.child_name}%`);
    }

    // Filter by chat_name (partial match, case-insensitive)
    if (params.chat_name) {
      query = query.ilike('chat.chat_name', `%${params.chat_name}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Database query error:', error);
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Transform the response to flatten the structure
    const messages: MessageResponse[] = (data || []).map((msg: any) => ({
      id: msg.id,
      text_content: msg.text_content,
      sender_label: msg.sender_label,
      message_timestamp: msg.message_timestamp,
      msg_type: msg.msg_type,
      is_child_sender: msg.is_child_sender,
      media_url: msg.media_url,
      chat_id: msg.chat?.id,
      chat_name: msg.chat?.chat_name,
      child_id: msg.chat?.child?.id,
      child_name: msg.chat?.child?.display_name,
    }));

    console.log(`Found ${messages.length} messages`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: messages,
        count: messages.length,
        limit: params.limit,
        offset: params.offset
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
