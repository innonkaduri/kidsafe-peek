import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AlertEmailRequest {
  to: string;
  child_name: string;
  risk_level: string;
  summary: string;
  original_message?: string;
  recommendations?: string[];
}

function getRiskLevelColor(level: string): string {
  switch (level.toLowerCase()) {
    case 'critical': return '#dc2626';
    case 'high': return '#ea580c';
    case 'medium': return '#ca8a04';
    case 'low': return '#16a34a';
    default: return '#6b7280';
  }
}

function getRiskLevelText(level: string): string {
  switch (level.toLowerCase()) {
    case 'critical': return 'קריטי';
    case 'high': return 'גבוה';
    case 'medium': return 'בינוני';
    case 'low': return 'נמוך';
    default: return level;
  }
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { to, child_name, risk_level, summary, original_message, recommendations }: AlertEmailRequest = await req.json();

    // Validate required fields
    if (!to || !child_name || !risk_level || !summary) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields: to, child_name, risk_level, summary" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid email format" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const riskColor = getRiskLevelColor(risk_level);
    const riskText = getRiskLevelText(risk_level);

    const recommendationsHtml = recommendations && recommendations.length > 0
      ? `
        <div style="background: #f3f4f6; border-radius: 8px; padding: 16px; margin-top: 20px;">
          <h3 style="margin: 0 0 12px 0; color: #374151; font-size: 16px;">המלצות:</h3>
          <ul style="margin: 0; padding-right: 20px; color: #4b5563;">
            ${recommendations.map(rec => `<li style="margin-bottom: 8px;">${rec}</li>`).join('')}
          </ul>
        </div>
      `
      : '';

    const originalMessageHtml = original_message
      ? `
        <div style="background: #fef3c7; border-radius: 8px; padding: 16px; margin-top: 20px; border-right: 4px solid #f59e0b;">
          <h3 style="margin: 0 0 12px 0; color: #92400e; font-size: 14px;">תוכן ההודעה:</h3>
          <p style="margin: 0; color: #78350f; font-size: 14px; white-space: pre-wrap;">${original_message}</p>
        </div>
      `
      : '';

    const emailHtml = `
      <!DOCTYPE html>
      <html dir="rtl" lang="he">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f9fafb;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: white; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); padding: 24px; text-align: center;">
              <h1 style="margin: 0; color: white; font-size: 24px;">⚠️ התראת בטיחות</h1>
              <p style="margin: 8px 0 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">מערכת ניטור הילדים</p>
            </div>
            
            <!-- Content -->
            <div style="padding: 24px;">
              <!-- Risk Badge -->
              <div style="text-align: center; margin-bottom: 20px;">
                <span style="display: inline-block; background: ${riskColor}; color: white; padding: 8px 20px; border-radius: 20px; font-weight: bold; font-size: 16px;">
                  רמת סיכון: ${riskText}
                </span>
              </div>
              
              <!-- Child Name -->
              <div style="text-align: center; margin-bottom: 20px;">
                <p style="margin: 0; color: #6b7280; font-size: 14px;">התראה עבור</p>
                <p style="margin: 4px 0 0 0; color: #111827; font-size: 20px; font-weight: bold;">${child_name}</p>
              </div>
              
              <!-- Summary -->
              <div style="background: #eff6ff; border-radius: 8px; padding: 16px; border-right: 4px solid #3b82f6;">
                <h3 style="margin: 0 0 8px 0; color: #1e40af; font-size: 14px;">סיכום האירוע:</h3>
                <p style="margin: 0; color: #1e3a8a; font-size: 16px; line-height: 1.6;">${summary}</p>
              </div>
              
              ${originalMessageHtml}
              ${recommendationsHtml}
              
              <!-- Footer Note -->
              <p style="margin-top: 24px; text-align: center; color: #9ca3af; font-size: 12px;">
                הודעה זו נשלחה אוטומטית ממערכת ניטור הילדים.<br>
                מומלץ לשוחח עם הילד על הנושא באופן פתוח ותומך.
              </p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    console.log(`Sending alert email to ${to} for child ${child_name} with risk level ${risk_level}`);

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "SafeKids Alerts <onboarding@resend.dev>",
        to: [to],
        subject: `⚠️ התראת בטיחות - ${child_name} - רמת סיכון ${riskText}`,
        html: emailHtml,
      }),
    });

    const emailData = await emailResponse.json();

    if (!emailResponse.ok) {
      console.error("Resend API error:", emailData);
      return new Response(
        JSON.stringify({ success: false, error: emailData.message || "Failed to send email" }),
        { status: 502, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Email sent successfully:", emailData);

    return new Response(
      JSON.stringify({ success: true, message_id: emailData.id }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error sending alert email:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
