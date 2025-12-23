import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Message {
  id: string;
  sender_label: string;
  is_child_sender: boolean;
  msg_type: string;
  message_timestamp: string;
  text_content: string | null;
  chat_name?: string;
}

interface AnalysisRequest {
  child_id: string;
  scan_id: string;
  messages: Message[];
  lookback_window: string;
}

const ASSISTANT_ID = "asst_epnwyX2RqHBRjbDdN4YQIYPs";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const { child_id, scan_id, messages, lookback_window }: AnalysisRequest = await req.json();

    console.log(`Analyzing ${messages.length} messages for child ${child_id}, scan ${scan_id}`);

    if (!messages || messages.length === 0) {
      console.log("No messages to analyze");
      return new Response(
        JSON.stringify({
          threatDetected: false,
          riskLevel: null,
          threatTypes: [],
          triggers: [],
          patterns: [],
          explanation: "לא נמצאו הודעות לניתוח",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Format messages for analysis
    const formattedMessages = messages.map((msg) => ({
      id: msg.id,
      sender: msg.sender_label,
      isChild: msg.is_child_sender,
      type: msg.msg_type,
      time: msg.message_timestamp,
      content: msg.text_content || "[מדיה]",
      chat: msg.chat_name || "שיחה",
    }));

    const lookbackLabel = lookback_window === "24h" ? "24 שעות אחרונות" : 
                          lookback_window === "7d" ? "7 ימים אחרונים" : "30 ימים אחרונים";

    const userPrompt = `נתח את השיחות הבאות וזהה סיכונים פוטנציאליים לילד/ה:

טווח ניתוח: ${lookbackLabel}

הודעות לניתוח:
${JSON.stringify(formattedMessages, null, 2)}

החזר תשובה בפורמט JSON בלבד עם המבנה הבא:
{
  "threatDetected": boolean,
  "riskLevel": "low" | "medium" | "high" | "critical" | null,
  "threatTypes": string[],
  "triggers": [
    {
      "messageId": string,
      "type": "text" | "image" | "audio",
      "preview": string,
      "confidence": number
    }
  ],
  "patterns": [
    {
      "chatId": string,
      "patternType": string,
      "description": string,
      "confidence": number
    }
  ],
  "explanation": string
}`;

    console.log("Creating thread with OpenAI Assistants API...");

    // Step 1: Create a thread
    const threadResponse = await fetch("https://api.openai.com/v1/threads", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "assistants=v2",
      },
      body: JSON.stringify({}),
    });

    if (!threadResponse.ok) {
      const errorText = await threadResponse.text();
      console.error("Failed to create thread:", errorText);
      throw new Error(`Failed to create thread: ${threadResponse.status}`);
    }

    const thread = await threadResponse.json();
    console.log("Thread created:", thread.id);

    // Step 2: Add message to thread
    const messageResponse = await fetch(`https://api.openai.com/v1/threads/${thread.id}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "assistants=v2",
      },
      body: JSON.stringify({
        role: "user",
        content: userPrompt,
      }),
    });

    if (!messageResponse.ok) {
      const errorText = await messageResponse.text();
      console.error("Failed to add message:", errorText);
      throw new Error(`Failed to add message: ${messageResponse.status}`);
    }

    console.log("Message added to thread");

    // Step 3: Run the assistant
    const runResponse = await fetch(`https://api.openai.com/v1/threads/${thread.id}/runs`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "assistants=v2",
      },
      body: JSON.stringify({
        assistant_id: ASSISTANT_ID,
      }),
    });

    if (!runResponse.ok) {
      const errorText = await runResponse.text();
      console.error("Failed to create run:", errorText);
      throw new Error(`Failed to create run: ${runResponse.status}`);
    }

    const run = await runResponse.json();
    console.log("Run created:", run.id);

    // Step 4: Poll for completion
    let runStatus = run.status;
    let lastError: { code?: string; message?: string } | null = null;
    let attempts = 0;
    const maxAttempts = 60; // 60 seconds max

    const isTerminal = (s: string) => ["completed", "failed", "cancelled", "expired"].includes(s);

    while (!isTerminal(runStatus) && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const statusResponse = await fetch(`https://api.openai.com/v1/threads/${thread.id}/runs/${run.id}`, {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "OpenAI-Beta": "assistants=v2",
        },
      });

      const statusText = await statusResponse.text();
      let statusData: any = {};
      try {
        statusData = statusText ? JSON.parse(statusText) : {};
      } catch {
        // ignore
      }

      runStatus = statusData.status ?? runStatus;
      lastError = statusData.last_error ?? lastError;
      attempts++;

      console.log(`Run status: ${runStatus} (attempt ${attempts})`);

      if (runStatus === "requires_action") {
        console.error("Assistant run requires_action; tool calls are not supported in this function.");
        break;
      }
    }

    if (runStatus !== "completed") {
      const errMsg =
        runStatus === "requires_action"
          ? "Assistant run requires tool actions (requires_action)"
          : lastError?.message
          ? `Run failed: ${lastError.message}`
          : `Run did not complete. Final status: ${runStatus}`;

      console.error("Run failed details:", { runStatus, lastError });
      throw new Error(errMsg);
    }

    // Step 5: Get messages
    const messagesResponse = await fetch(`https://api.openai.com/v1/threads/${thread.id}/messages`, {
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "OpenAI-Beta": "assistants=v2",
      },
    });

    const messagesData = await messagesResponse.json();
    const assistantMessage = messagesData.data.find((m: any) => m.role === "assistant");
    
    if (!assistantMessage) {
      throw new Error("No assistant message found");
    }

    const content = assistantMessage.content[0]?.text?.value;
    if (!content) {
      throw new Error("No content in assistant message");
    }

    console.log("Assistant response received");

    // Parse JSON from response
    let analysisResult;
    try {
      const cleanedContent = content
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      analysisResult = JSON.parse(cleanedContent);
    } catch (parseError) {
      console.error("Failed to parse assistant response:", content);
      analysisResult = {
        threatDetected: false,
        riskLevel: null,
        threatTypes: [],
        triggers: [],
        patterns: [],
        explanation: "לא ניתן לנתח את התוכן כרגע",
      };
    }

    console.log("Analysis complete:", {
      threatDetected: analysisResult.threatDetected,
      riskLevel: analysisResult.riskLevel,
    });

    return new Response(JSON.stringify(analysisResult), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in analyze-threats function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
