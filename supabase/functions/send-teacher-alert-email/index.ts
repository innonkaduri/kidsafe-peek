import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TeacherAlertEmailRequest {
  to: string;
  teacher_name?: string;
  child_name: string;
  parent_name?: string;
  severity: string;
  category?: string;
  summary: string;
  ticket_id: string;
}

function getSeverityColor(level: string): string {
  switch (level.toLowerCase()) {
    case 'critical': return '#dc2626';
    case 'high': return '#ea580c';
    case 'medium': return '#ca8a04';
    case 'low': return '#16a34a';
    default: return '#6b7280';
  }
}

function getSeverityText(level: string): string {
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
    const { 
      to, 
      teacher_name, 
      child_name, 
      parent_name,
      severity, 
      category,
      summary,
      ticket_id
    }: TeacherAlertEmailRequest = await req.json();

    // Validate required fields
    if (!to || !child_name || !severity || !summary || !ticket_id) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
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

    const severityColor = getSeverityColor(severity);
    const severityText = getSeverityText(severity);

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
            <div style="background: linear-gradient(135deg, #7c3aed 0%, #a855f7 100%); padding: 24px; text-align: center;">
              <h1 style="margin: 0; color: white; font-size: 24px;">👨‍🏫 שיתוף התראה מהורה</h1>
              <p style="margin: 8px 0 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">SafeKids Guardian - פורטל מורים</p>
            </div>
            
            <!-- Content -->
            <div style="padding: 24px;">
              ${teacher_name ? `<p style="margin: 0 0 16px 0; color: #374151; font-size: 16px;">שלום ${teacher_name},</p>` : '<p style="margin: 0 0 16px 0; color: #374151; font-size: 16px;">שלום,</p>'}
              
              <p style="margin: 0 0 20px 0; color: #374151; font-size: 16px;">
                ${parent_name ? `${parent_name}` : 'הורה'} שיתף/ה איתך התראה הקשורה לילד/ה <strong>${child_name}</strong>.
              </p>
              
              <!-- Severity Badge -->
              <div style="text-align: center; margin-bottom: 20px;">
                <span style="display: inline-block; background: ${severityColor}; color: white; padding: 8px 20px; border-radius: 20px; font-weight: bold; font-size: 14px;">
                  רמת חומרה: ${severityText}
                </span>
              </div>
              
              ${category ? `
              <div style="margin-bottom: 16px;">
                <p style="margin: 0; color: #6b7280; font-size: 12px;">קטגוריה:</p>
                <p style="margin: 4px 0 0 0; color: #111827; font-size: 14px; font-weight: 500;">${category}</p>
              </div>
              ` : ''}
              
              <!-- Summary -->
              <div style="background: #f3f4f6; border-radius: 8px; padding: 16px; margin-top: 16px;">
                <h3 style="margin: 0 0 12px 0; color: #374151; font-size: 14px;">תקציר האירוע:</h3>
                <p style="margin: 0; color: #4b5563; font-size: 14px; line-height: 1.6;">${summary}</p>
              </div>
              
              <!-- CTA Button -->
              <div style="text-align: center; margin-top: 24px;">
                <p style="margin: 0 0 12px 0; color: #6b7280; font-size: 14px;">
                  לצפייה בפרטים המלאים ולמתן משוב, התחבר/י לפורטל המורים:
                </p>
              </div>
              
              <!-- Footer Note -->
              <p style="margin-top: 24px; text-align: center; color: #9ca3af; font-size: 12px;">
                הודעה זו נשלחה אוטומטית ממערכת SafeKids Guardian.<br>
                מזהה טיקט: ${ticket_id.slice(0, 8)}
              </p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    console.log(`Sending teacher alert email to ${to} for child ${child_name}`);

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "SafeKids <onboarding@resend.dev>",
        to: [to],
        subject: `👨‍🏫 שיתוף התראה - ${child_name} - רמת חומרה ${severityText}`,
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

    console.log("Teacher alert email sent successfully:", emailData);

    return new Response(
      JSON.stringify({ success: true, message_id: emailData.id }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error sending teacher alert email:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
