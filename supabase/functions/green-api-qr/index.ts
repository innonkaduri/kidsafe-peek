import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface QRResponse {
  type: "qrCode" | "alreadyLogged" | "error";
  message?: string;
}

interface StateResponse {
  stateInstance: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ type: "error", message: "Missing Authorization header" }),
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
      return new Response(
        JSON.stringify({ type: "error", message: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get credentials
    const instanceId = Deno.env.get("GREEN_API_INSTANCE_ID");
    const apiToken = Deno.env.get("GREEN_API_TOKEN");

    if (!instanceId || !apiToken) {
      return new Response(
        JSON.stringify({ type: "error", message: "Missing Green API credentials" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const baseUrl = `https://api.green-api.com/waInstance${instanceId}`;

    let action = "qr";
    try {
      const body = await req.clone().json();
      action = body.action || "qr";
    } catch { /* default to qr */ }

    if (action === "status") {
      const stateResponse = await fetch(`${baseUrl}/getStateInstance/${apiToken}`);
      if (stateResponse.status === 429) {
        return new Response(
          JSON.stringify({ status: "unknown", authorized: false, rateLimited: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (!stateResponse.ok) throw new Error(`Status check failed: ${stateResponse.status}`);
      const stateData: StateResponse = await stateResponse.json();
      return new Response(
        JSON.stringify({ status: stateData.stateInstance, authorized: stateData.stateInstance === "authorized" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const qrResponse = await fetch(`${baseUrl}/qr/${apiToken}`);
    if (qrResponse.status === 429) {
      return new Response(
        JSON.stringify({ type: "error", message: "Rate limited", rateLimited: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!qrResponse.ok) throw new Error(`QR fetch failed: ${qrResponse.status}`);

    const qrData = await qrResponse.json();
    const response: QRResponse = { type: qrData.type || "error", message: qrData.message };

    return new Response(JSON.stringify(response), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(
      JSON.stringify({ type: "error", message: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
