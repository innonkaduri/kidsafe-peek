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
  media_type?: 'image' | 'audio' | 'video' | 'all';
  from_date?: string;
  to_date?: string;
  child_only?: boolean;
  limit?: number;
  offset?: number;
}

interface MinimalMessage {
  chat: string;
  text: string | null;
  media: string | null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let params: FetchMessagesRequest;
    
    if (req.method === 'GET') {
      const url = new URL(req.url);
      params = {
        child_name: url.searchParams.get('child_name') || undefined,
        chat_name: url.searchParams.get('chat_name') || undefined,
        child_id: url.searchParams.get('child_id') || undefined,
        chat_id: url.searchParams.get('chat_id') || undefined,
        media_type: (url.searchParams.get('media_type') as FetchMessagesRequest['media_type']) || undefined,
        from_date: url.searchParams.get('from_date') || undefined,
        to_date: url.searchParams.get('to_date') || undefined,
        child_only: url.searchParams.get('child_only') === 'true',
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

    let query = supabase
      .from('messages')
      .select(`
        text_content,
        media_url,
        msg_type,
        is_child_sender,
        message_timestamp,
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

    // Filter by child_id
    if (params.child_id) {
      query = query.eq('child_id', params.child_id);
    }

    // Filter by chat_id
    if (params.chat_id) {
      query = query.eq('chat_id', params.chat_id);
    }

    // Filter by child_name (partial match)
    if (params.child_name) {
      query = query.ilike('chat.child.display_name', `%${params.child_name}%`);
    }

    // Filter by chat_name (partial match)
    if (params.chat_name) {
      query = query.ilike('chat.chat_name', `%${params.chat_name}%`);
    }

    // Filter by media type
    if (params.media_type && params.media_type !== 'all') {
      query = query.eq('msg_type', params.media_type);
    }

    // Filter by date range
    if (params.from_date) {
      query = query.gte('message_timestamp', params.from_date);
    }
    if (params.to_date) {
      query = query.lte('message_timestamp', params.to_date + 'T23:59:59');
    }

    // Filter child messages only
    if (params.child_only) {
      query = query.eq('is_child_sender', true);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Database query error:', error);
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Minimal response structure
    const messages: MinimalMessage[] = (data || []).map((msg: any) => ({
      chat: msg.chat?.chat_name || '',
      text: msg.text_content,
      media: msg.media_url
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
