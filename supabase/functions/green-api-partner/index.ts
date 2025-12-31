import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CreateInstanceRequest {
  action: "createInstance" | "deleteInstance" | "getStatus" | "fixWebhook";
  child_id: string;
}

interface CreateInstanceResponse {
  idInstance: number;
  apiTokenInstance: string;
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
        JSON.stringify({ error: "Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth client for user verification
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Service client for DB operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: CreateInstanceRequest = await req.json();
    const { action, child_id } = body;

    if (!child_id) {
      return new Response(
        JSON.stringify({ error: "child_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify user owns this child
    const { data: child, error: childError } = await supabase
      .from("children")
      .select("id, display_name, user_id")
      .eq("id", child_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (childError || !child) {
      return new Response(
        JSON.stringify({ error: "Child not found or access denied" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const partnerToken = Deno.env.get("GREEN_API_PARTNER_TOKEN");
    const partnerUrl = Deno.env.get("GREEN_API_PARTNER_URL") || "https://api.green-api.com";

    if (!partnerToken) {
      return new Response(
        JSON.stringify({ error: "Partner token not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Ensure data source exists
    let { data: dataSource } = await supabase
      .from("data_sources")
      .select("id")
      .eq("child_id", child_id)
      .eq("source_type", "connector")
      .maybeSingle();

    if (!dataSource) {
      const { data: newDs, error: dsError } = await supabase
        .from("data_sources")
        .insert({
          child_id: child_id,
          source_type: "connector",
          status: "active",
        })
        .select("id")
        .single();

      if (dsError) {
        console.error("Error creating data source:", dsError);
        throw dsError;
      }
      dataSource = newDs;
    }

    // Handle actions
    if (action === "createInstance") {
      // Check if instance already exists
      const { data: existingCred } = await supabase
        .from("connector_credentials")
        .select("id, instance_id, status")
        .eq("child_id", child_id)
        .maybeSingle();

      if (existingCred && existingCred.status === "authorized") {
        return new Response(
          JSON.stringify({ 
            success: true, 
            status: "already_connected",
            instance_id: existingCred.instance_id 
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Delete old pending instance if exists
      if (existingCred) {
        // Try to delete old instance from Green API
        if (existingCred.instance_id) {
          try {
            await fetch(`${partnerUrl}/partner/deleteInstanceAccount/${partnerToken}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ idInstance: parseInt(existingCred.instance_id) }),
            });
          } catch (e) {
            console.log("Old instance delete attempt:", e);
          }
        }
        await supabase.from("connector_credentials").delete().eq("id", existingCred.id);
      }

      // Create new instance
      console.log("Creating new instance for child:", child_id);
      
      const webhookUrl = `${supabaseUrl}/functions/v1/green-api-webhook?child_id=${child_id}`;
      
      const createResponse = await fetch(`${partnerUrl}/partner/createInstance/${partnerToken}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `SafeWatch-${child.display_name}-${child_id.slice(0, 8)}`,
          webhookUrl: webhookUrl,
          webhookUrlToken: "",
          delaySendMessagesMilliseconds: 1000,
          markIncomingMessagesReaded: "no",
          markIncomingMessagesReadedOnReply: "no",
          incomingWebhook: "yes",
          outgoingWebhook: "yes",
          outgoingAPIMessageWebhook: "yes",
          outgoingMessageWebhook: "yes",
          stateWebhook: "yes",
          statusInstanceWebhook: "yes",
          keepOnlineStatus: "yes",
        }),
      });

      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        console.error("Partner API error:", errorText);
        return new Response(
          JSON.stringify({ error: "Failed to create instance", details: errorText }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const instanceData: CreateInstanceResponse = await createResponse.json();
      console.log("Instance created:", instanceData.idInstance);

      // Save credentials
      const { error: credError } = await supabase
        .from("connector_credentials")
        .insert({
          data_source_id: dataSource.id,
          child_id: child_id,
          instance_id: instanceData.idInstance.toString(),
          api_token: instanceData.apiTokenInstance,
          status: "pending",
        });

      if (credError) {
        console.error("Error saving credentials:", credError);
        throw credError;
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          status: "created",
          instance_id: instanceData.idInstance.toString()
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } else if (action === "deleteInstance") {
      const { data: cred } = await supabase
        .from("connector_credentials")
        .select("id, instance_id")
        .eq("child_id", child_id)
        .maybeSingle();

      if (!cred) {
        return new Response(
          JSON.stringify({ success: true, status: "no_instance" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Delete from Green API
      if (cred.instance_id) {
        console.log("Deleting instance:", cred.instance_id);
        try {
          const deleteResponse = await fetch(`${partnerUrl}/partner/deleteInstanceAccount/${partnerToken}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idInstance: parseInt(cred.instance_id) }),
          });
          
          if (!deleteResponse.ok) {
            console.error("Green API delete error:", await deleteResponse.text());
          }
        } catch (e) {
          console.error("Delete API call error:", e);
        }
      }

      // ========== CLEANUP ALL CHILD DATA ==========
      // Golden rule: When deleting a WhatsApp connection, wipe ALL associated data
      console.log(`[CLEANUP] Starting data cleanup for child_id: ${child_id}`);

      // 1. Get all chat IDs for this child (needed for patterns and scan_checkpoints)
      const { data: chats } = await supabase
        .from("chats")
        .select("id")
        .eq("child_id", child_id);
      const chatIds = chats?.map(c => c.id) || [];
      console.log(`[CLEANUP] Found ${chatIds.length} chats to delete`);

      // 2. Get all scan IDs for this child (needed for patterns)
      const { data: scans } = await supabase
        .from("scans")
        .select("id")
        .eq("child_id", child_id);
      const scanIds = scans?.map(s => s.id) || [];
      console.log(`[CLEANUP] Found ${scanIds.length} scans to delete`);

      // 3. Get all finding IDs for this child (needed for evidence_items)
      const { data: findings } = await supabase
        .from("findings")
        .select("id")
        .eq("child_id", child_id);
      const findingIds = findings?.map(f => f.id) || [];
      console.log(`[CLEANUP] Found ${findingIds.length} findings to delete`);

      // 4. Delete in correct order (children tables first, then parents)
      
      // Delete evidence_items (depends on findings)
      if (findingIds.length > 0) {
        const { error: evErr } = await supabase
          .from("evidence_items")
          .delete()
          .in("finding_id", findingIds);
        if (evErr) console.error("[CLEANUP] evidence_items error:", evErr);
        else console.log("[CLEANUP] Deleted evidence_items");
      }

      // Delete patterns (depends on scans and chats)
      if (scanIds.length > 0) {
        const { error: patErr } = await supabase
          .from("patterns")
          .delete()
          .in("scan_id", scanIds);
        if (patErr) console.error("[CLEANUP] patterns error:", patErr);
        else console.log("[CLEANUP] Deleted patterns");
      }

      // Delete scan_checkpoints (depends on chats)
      if (chatIds.length > 0) {
        const { error: scErr } = await supabase
          .from("scan_checkpoints")
          .delete()
          .in("chat_id", chatIds);
        if (scErr) console.error("[CLEANUP] scan_checkpoints error:", scErr);
        else console.log("[CLEANUP] Deleted scan_checkpoints");
      }

      // Delete small_signals (depends on messages, but we'll delete by child_id through messages)
      const { data: messages } = await supabase
        .from("messages")
        .select("id")
        .eq("child_id", child_id);
      const messageIds = messages?.map(m => m.id) || [];
      console.log(`[CLEANUP] Found ${messageIds.length} messages to delete`);

      if (messageIds.length > 0) {
        const { error: ssErr } = await supabase
          .from("small_signals")
          .delete()
          .in("message_id", messageIds);
        if (ssErr) console.error("[CLEANUP] small_signals error:", ssErr);
        else console.log("[CLEANUP] Deleted small_signals");
      }

      // Delete findings (depends on child_id)
      const { error: findErr } = await supabase
        .from("findings")
        .delete()
        .eq("child_id", child_id);
      if (findErr) console.error("[CLEANUP] findings error:", findErr);
      else console.log("[CLEANUP] Deleted findings");

      // Delete smart_decisions (depends on child_id)
      const { error: sdErr } = await supabase
        .from("smart_decisions")
        .delete()
        .eq("child_id", child_id);
      if (sdErr) console.error("[CLEANUP] smart_decisions error:", sdErr);
      else console.log("[CLEANUP] Deleted smart_decisions");

      // Delete scans (depends on child_id)
      const { error: scanErr } = await supabase
        .from("scans")
        .delete()
        .eq("child_id", child_id);
      if (scanErr) console.error("[CLEANUP] scans error:", scanErr);
      else console.log("[CLEANUP] Deleted scans");

      // Delete messages (depends on child_id)
      const { error: msgErr } = await supabase
        .from("messages")
        .delete()
        .eq("child_id", child_id);
      if (msgErr) console.error("[CLEANUP] messages error:", msgErr);
      else console.log("[CLEANUP] Deleted messages");

      // Delete chats (depends on child_id)
      const { error: chatErr } = await supabase
        .from("chats")
        .delete()
        .eq("child_id", child_id);
      if (chatErr) console.error("[CLEANUP] chats error:", chatErr);
      else console.log("[CLEANUP] Deleted chats");

      // Delete imports (depends on child_id)
      const { error: impErr } = await supabase
        .from("imports")
        .delete()
        .eq("child_id", child_id);
      if (impErr) console.error("[CLEANUP] imports error:", impErr);
      else console.log("[CLEANUP] Deleted imports");

      // Delete usage_meter (depends on child_id)
      const { error: umErr } = await supabase
        .from("usage_meter")
        .delete()
        .eq("child_id", child_id);
      if (umErr) console.error("[CLEANUP] usage_meter error:", umErr);
      else console.log("[CLEANUP] Deleted usage_meter");

      console.log(`[CLEANUP] Completed data cleanup for child_id: ${child_id}`);
      // ========== END CLEANUP ==========

      // Delete connector_credentials
      await supabase.from("connector_credentials").delete().eq("id", cred.id);

      return new Response(
        JSON.stringify({ success: true, status: "deleted" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } else if (action === "getStatus") {
      const { data: cred } = await supabase
        .from("connector_credentials")
        .select("id, instance_id, api_token, status")
        .eq("child_id", child_id)
        .maybeSingle();

      if (!cred || !cred.instance_id) {
        return new Response(
          JSON.stringify({ status: "no_instance", hasInstance: false }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check actual status from Green API
      const instanceId = cred.instance_id;
      const apiToken = cred.api_token;

      try {
        const stateResponse = await fetch(
          `https://api.green-api.com/waInstance${instanceId}/getStateInstance/${apiToken}`
        );

        if (stateResponse.status === 429) {
          // Rate limited, return cached status
          return new Response(
            JSON.stringify({ 
              status: cred.status, 
              hasInstance: true,
              rateLimited: true 
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (!stateResponse.ok) {
          console.error("State check failed:", stateResponse.status);
          return new Response(
            JSON.stringify({ status: cred.status, hasInstance: true }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const stateData = await stateResponse.json();
        const newStatus = stateData.stateInstance === "authorized" ? "authorized" : "pending";

        // Update status in DB if changed
        if (newStatus !== cred.status) {
          await supabase
            .from("connector_credentials")
            .update({ status: newStatus, last_checked_at: new Date().toISOString() })
            .eq("id", cred.id);
        }

        return new Response(
          JSON.stringify({ 
            status: newStatus, 
            hasInstance: true,
            stateInstance: stateData.stateInstance 
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

      } catch (e) {
        console.error("State check error:", e);
        return new Response(
          JSON.stringify({ status: cred.status, hasInstance: true, error: "state_check_failed" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else if (action === "fixWebhook") {
      // Fix webhook settings to ensure outgoing messages are captured
      const { data: cred } = await supabase
        .from("connector_credentials")
        .select("id, instance_id, api_token, status")
        .eq("child_id", child_id)
        .maybeSingle();

      if (!cred || !cred.instance_id || !cred.api_token) {
        return new Response(
          JSON.stringify({ error: "No WhatsApp instance found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const instanceId = cred.instance_id;
      const apiToken = cred.api_token;
      const webhookUrl = `${supabaseUrl}/functions/v1/green-api-webhook?child_id=${child_id}`;

      console.log(`Fixing webhook settings for instance ${instanceId}`);

      try {
        // Update settings via Green API
        const settingsResponse = await fetch(
          `https://api.green-api.com/waInstance${instanceId}/setSettings/${apiToken}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              webhookUrl: webhookUrl,
              webhookUrlToken: "",
              incomingWebhook: "yes",
              outgoingWebhook: "yes",
              outgoingAPIMessageWebhook: "yes",
              outgoingMessageWebhook: "yes",
              stateWebhook: "yes",
              statusInstanceWebhook: "yes",
              keepOnlineStatus: "yes",
            }),
          }
        );

        if (!settingsResponse.ok) {
          const errorText = await settingsResponse.text();
          console.error("Failed to update settings:", errorText);
          return new Response(
            JSON.stringify({ error: "Failed to update webhook settings", details: errorText }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const settingsResult = await settingsResponse.json();
        console.log("Webhook settings updated:", settingsResult);

        return new Response(
          JSON.stringify({ 
            success: true, 
            status: "webhook_fixed",
            settings: settingsResult 
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

      } catch (e) {
        console.error("fixWebhook error:", e);
        return new Response(
          JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Partner function error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
