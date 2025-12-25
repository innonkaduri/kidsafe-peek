import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface QRResponse {
  type: "qrCode" | "alreadyLogged" | "error" | "noInstance";
  message?: string;
}

serve(async (req) => {
  console.log("green-api-qr: Request received", req.method);
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse body first to get child_id
    let action = "qr";
    let childId: string | null = null;
    
    try {
      const body = await req.json();
      console.log("green-api-qr: Body parsed", JSON.stringify(body));
      action = body.action || "qr";
      childId = body.child_id || null;
    } catch (e) {
      console.error("green-api-qr: Body parse error", e);
    }

    if (!childId) {
      console.error("green-api-qr: child_id missing");
      return new Response(
        JSON.stringify({ type: "error", message: "child_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ type: "error", message: "Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ type: "error", message: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("green-api-qr: Authenticated user", user.id, "action:", action, "child_id:", childId);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user owns this child
    const { data: child } = await supabase
      .from("children")
      .select("id")
      .eq("id", childId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!child) {
      return new Response(
        JSON.stringify({ type: "error", message: "Child not found or access denied" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get credentials for this child
    const { data: cred } = await supabase
      .from("connector_credentials")
      .select("instance_id, api_token, status")
      .eq("child_id", childId)
      .maybeSingle();

    if (!cred || !cred.instance_id || !cred.api_token) {
      return new Response(
        JSON.stringify({ type: "noInstance", message: "No WhatsApp instance for this child" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const instanceId = cred.instance_id;
    const apiToken = cred.api_token;
    const baseUrl = `https://api.green-api.com/waInstance${instanceId}`;

    if (action === "status") {
      try {
        const stateResponse = await fetch(`${baseUrl}/getStateInstance/${apiToken}`);
        
        if (stateResponse.status === 429) {
          return new Response(
            JSON.stringify({ status: cred.status, authorized: cred.status === "authorized", rateLimited: true }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        if (!stateResponse.ok) {
          throw new Error(`Status check failed: ${stateResponse.status}`);
        }
        
        const stateData = await stateResponse.json();
        const authorized = stateData.stateInstance === "authorized";

        // Update status in DB if changed
        if ((authorized && cred.status !== "authorized") || (!authorized && cred.status === "authorized")) {
          await supabase
            .from("connector_credentials")
            .update({ 
              status: authorized ? "authorized" : "pending",
              last_checked_at: new Date().toISOString()
            })
            .eq("child_id", childId);
        }

        return new Response(
          JSON.stringify({ status: stateData.stateInstance, authorized }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (e) {
        console.error("Status check error:", e);
        return new Response(
          JSON.stringify({ status: cred.status, authorized: cred.status === "authorized" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Fetch QR code
    try {
      const qrResponse = await fetch(`${baseUrl}/qr/${apiToken}`);
      
      if (qrResponse.status === 429) {
        return new Response(
          JSON.stringify({ type: "error", message: "Rate limited, please wait", rateLimited: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      // 400 often means instance not ready yet - don't delete, just wait
      if (qrResponse.status === 400) {
        console.log("green-api-qr: Instance not ready yet (400), waiting...");
        return new Response(
          JSON.stringify({
            type: "error",
            message: "Instance is initializing, please wait...",
            notReady: true,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      // 401 means invalid/expired credentials - clear them
      if (qrResponse.status === 401) {
        console.log("green-api-qr: Instance invalid (401), clearing credentials");
        await supabase
          .from("connector_credentials")
          .delete()
          .eq("child_id", childId);

        return new Response(
          JSON.stringify({
            type: "noInstance",
            message: "Instance expired/invalid. Please create a new connection.",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      // Other 4xx errors
      if (qrResponse.status >= 400 && qrResponse.status < 500) {
        console.log("green-api-qr: QR error", qrResponse.status);
        return new Response(
          JSON.stringify({
            type: "error",
            message: `QR code error: ${qrResponse.status}`,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!qrResponse.ok) {
        throw new Error(`QR fetch failed: ${qrResponse.status}`);
      }

      const qrData = await qrResponse.json();
      const response: QRResponse = { 
        type: qrData.type || "error", 
        message: qrData.message 
      };

      // If already logged, update status
      if (qrData.type === "alreadyLogged") {
        await supabase
          .from("connector_credentials")
          .update({ status: "authorized", last_checked_at: new Date().toISOString() })
          .eq("child_id", childId);
      }

      return new Response(
        JSON.stringify(response), 
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (e) {
      console.error("QR fetch error:", e);
      return new Response(
        JSON.stringify({ type: "error", message: e instanceof Error ? e.message : "QR fetch failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

  } catch (error) {
    console.error("QR function error:", error);
    return new Response(
      JSON.stringify({ type: "error", message: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
