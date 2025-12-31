import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Minimum messages to trigger a scan
const MIN_MESSAGES_FOR_SCAN = 5;
// Minimum time between scans (15 minutes)
const MIN_SCAN_INTERVAL_MS = 15 * 60 * 1000;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { child_id, force = false } = await req.json();
    
    if (!child_id) {
      return new Response(
        JSON.stringify({ error: "child_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    console.log(`Auto-scan: Starting for child ${child_id}`);

    // Get child info
    const { data: child, error: childError } = await supabase
      .from("children")
      .select("id, display_name, user_id, age_range, monitoring_enabled")
      .eq("id", child_id)
      .single();

    if (childError || !child) {
      console.error("Auto-scan: Child not found", childError);
      return new Response(
        JSON.stringify({ error: "Child not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if monitoring is enabled
    if (!child.monitoring_enabled) {
      console.log(`Auto-scan: Monitoring disabled for child ${child_id}`);
      return new Response(
        JSON.stringify({ skipped: true, reason: "monitoring_disabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get last scan time
    const { data: lastScan } = await supabase
      .from("scans")
      .select("created_at, finished_at")
      .eq("child_id", child_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastScanTime = lastScan?.finished_at || lastScan?.created_at;
    const now = new Date();

    // Check minimum interval between scans (unless forced)
    if (!force && lastScanTime) {
      const timeSinceLastScan = now.getTime() - new Date(lastScanTime).getTime();
      if (timeSinceLastScan < MIN_SCAN_INTERVAL_MS) {
        console.log(`Auto-scan: Too soon since last scan (${Math.round(timeSinceLastScan / 60000)}min ago)`);
        return new Response(
          JSON.stringify({ skipped: true, reason: "too_soon", minutes_since_last: Math.round(timeSinceLastScan / 60000) }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Count new messages since last scan
    let messagesQuery = supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("child_id", child_id);

    if (lastScanTime) {
      messagesQuery = messagesQuery.gt("message_timestamp", lastScanTime);
    }

    const { count: newMessageCount } = await messagesQuery;

    console.log(`Auto-scan: Found ${newMessageCount || 0} new messages since last scan`);

    // Check if enough messages for scan (unless forced)
    if (!force && (newMessageCount || 0) < MIN_MESSAGES_FOR_SCAN) {
      console.log(`Auto-scan: Not enough new messages (${newMessageCount} < ${MIN_MESSAGES_FOR_SCAN})`);
      return new Response(
        JSON.stringify({ skipped: true, reason: "not_enough_messages", new_messages: newMessageCount }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch messages for analysis
    let fetchQuery = supabase
      .from("messages")
      .select(`
        id,
        text_content,
        msg_type,
        sender_label,
        is_child_sender,
        message_timestamp,
        media_url,
        image_caption,
        chat_id,
        chats!inner(id, chat_name, is_group)
      `)
      .eq("child_id", child_id)
      .order("message_timestamp", { ascending: false })
      .limit(200);

    if (lastScanTime) {
      fetchQuery = fetchQuery.gt("message_timestamp", lastScanTime);
    }

    const { data: messages, error: messagesError } = await fetchQuery;

    if (messagesError) {
      console.error("Auto-scan: Error fetching messages", messagesError);
      throw messagesError;
    }

    if (!messages || messages.length === 0) {
      console.log("Auto-scan: No messages to analyze");
      return new Response(
        JSON.stringify({ skipped: true, reason: "no_messages" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Auto-scan: Analyzing ${messages.length} messages`);

    // Create scan record
    const { data: scan, error: scanError } = await supabase
      .from("scans")
      .insert({
        child_id,
        status: "running",
        lookback_window: "auto",
        started_at: new Date().toISOString(),
        messages_analyzed: messages.length,
      })
      .select()
      .single();

    if (scanError) {
      console.error("Auto-scan: Error creating scan", scanError);
      throw scanError;
    }

    // Format messages for AI
    const formattedMessages = messages.map((msg: any) => ({
      messageId: msg.id,
      timestamp: msg.message_timestamp,
      chatId: msg.chat_id,
      chatName: msg.chats?.chat_name || "Unknown",
      sender: msg.sender_label,
      direction: msg.is_child_sender ? "outgoing" : "incoming",
      type: msg.msg_type,
      text: msg.text_content || "",
      caption: msg.image_caption || "",
      mediaUrl: msg.media_url || null,
    }));

    // Call AI analysis
    const childContext = JSON.stringify({
      childName: child.display_name,
      childAge: child.age_range,
    });

    const analysisResponse = await fetch(`${supabaseUrl}/functions/v1/analyze-threats-lovable`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        child_id,
        messages: formattedMessages,
        child_context: childContext,
      }),
    });

    if (!analysisResponse.ok) {
      const errorText = await analysisResponse.text();
      console.error("Auto-scan: AI analysis failed", errorText);
      
      // Update scan status to failed
      await supabase
        .from("scans")
        .update({ 
          status: "failed", 
          finished_at: new Date().toISOString(),
          summary_json: { error: errorText }
        })
        .eq("id", scan.id);

      throw new Error(`AI analysis failed: ${errorText}`);
    }

    const analysisResult = await analysisResponse.json();
    console.log("Auto-scan: AI analysis complete", JSON.stringify(analysisResult).slice(0, 500));

    // Process results
    const alerts = analysisResult.alerts || [];
    const threatDetected = alerts.length > 0;
    let findingsCreated = 0;
    let emailsSent = 0;

    if (threatDetected) {
      // Get parent email
      const { data: profile } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", child.user_id)
        .single();

      const parentEmail = profile?.email;

      for (const alert of alerts) {
        // Create finding
        const { data: finding, error: findingError } = await supabase
          .from("findings")
          .insert({
            child_id,
            scan_id: scan.id,
            threat_detected: true,
            threat_types: alert.threat_types || [alert.category],
            risk_level: alert.risk_level || "medium",
            explanation: alert.explanation || alert.summary,
            severity: alert.risk_level || "medium",
            ai_response_encrypted: alert,
          })
          .select()
          .single();

        if (findingError) {
          console.error("Auto-scan: Error creating finding", findingError);
        } else {
          findingsCreated++;
          console.log(`Auto-scan: Created finding ${finding.id}`);

          // Send email alert
          if (parentEmail) {
            try {
              const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-alert-email`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${supabaseServiceKey}`,
                },
                body: JSON.stringify({
                  to: parentEmail,
                  child_name: child.display_name,
                  risk_level: alert.risk_level || "medium",
                  summary: alert.explanation || alert.summary,
                  original_message: alert.evidence?.slice(0, 200),
                  recommendations: alert.recommendations,
                }),
              });

              if (emailResponse.ok) {
                emailsSent++;
                console.log(`Auto-scan: Email sent to ${parentEmail}`);
              } else {
                console.error("Auto-scan: Email failed", await emailResponse.text());
              }
            } catch (emailError) {
              console.error("Auto-scan: Email error", emailError);
            }
          }
        }
      }
    }

    // Update scan record
    const finishedAt = new Date();
    const durationSeconds = Math.round((finishedAt.getTime() - new Date(scan.started_at).getTime()) / 1000);

    await supabase
      .from("scans")
      .update({
        status: "completed",
        finished_at: finishedAt.toISOString(),
        duration_seconds: durationSeconds,
        summary_json: {
          threat_detected: threatDetected,
          alerts_count: alerts.length,
          findings_created: findingsCreated,
          emails_sent: emailsSent,
          auto_scan: true,
        },
      })
      .eq("id", scan.id);

    console.log(`Auto-scan: Complete. Threats: ${threatDetected}, Findings: ${findingsCreated}, Emails: ${emailsSent}`);

    return new Response(
      JSON.stringify({
        success: true,
        scan_id: scan.id,
        messages_analyzed: messages.length,
        threat_detected: threatDetected,
        alerts_count: alerts.length,
        findings_created: findingsCreated,
        emails_sent: emailsSent,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Auto-scan error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
