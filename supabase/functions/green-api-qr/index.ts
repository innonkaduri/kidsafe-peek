import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface QRResponse {
  type: "qrCode" | "alreadyLogged" | "error";
  message?: string; // QR base64 or error message
}

interface StateResponse {
  stateInstance: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const instanceId = Deno.env.get("GREEN_API_INSTANCE_ID");
    const apiToken = Deno.env.get("GREEN_API_TOKEN");

    if (!instanceId || !apiToken) {
      console.error("Missing GREEN_API credentials in secrets");
      return new Response(
        JSON.stringify({ 
          type: "error", 
          message: "Missing Green API credentials" 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const baseUrl = `https://api.green-api.com/waInstance${instanceId}`;

    // Parse request body for action
    let action = "qr";
    try {
      const body = await req.json();
      action = body.action || "qr";
    } catch {
      // Default to QR action
    }

    if (action === "status") {
      // Check connection status
      console.log("Checking Green API connection status");
      const stateResponse = await fetch(`${baseUrl}/getStateInstance/${apiToken}`);
      
      if (!stateResponse.ok) {
        throw new Error(`Status check failed: ${stateResponse.status}`);
      }

      const stateData: StateResponse = await stateResponse.json();
      console.log("State:", stateData.stateInstance);

      return new Response(
        JSON.stringify({ 
          status: stateData.stateInstance,
          authorized: stateData.stateInstance === "authorized"
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Default: Get QR code
    console.log("Fetching QR code from Green API");
    const qrResponse = await fetch(`${baseUrl}/qr/${apiToken}`);
    
    if (!qrResponse.ok) {
      throw new Error(`QR fetch failed: ${qrResponse.status}`);
    }

    const qrData = await qrResponse.json();
    console.log("QR response type:", qrData.type);

    // Green API returns: { type: "qrCode", message: "base64..." } 
    // or { type: "alreadyLogged" } or { type: "error", message: "..." }
    
    const response: QRResponse = {
      type: qrData.type || "error",
      message: qrData.message || undefined,
    };

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in green-api-qr:", error);
    return new Response(
      JSON.stringify({ 
        type: "error", 
        message: error instanceof Error ? error.message : "Unknown error" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
