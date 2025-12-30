import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TeacherFeedbackEmailRequest {
  to: string;
  parent_name?: string;
  child_name: string;
  teacher_name?: string;
  teacher_response: string;
  action_taken?: string;
  status: string;
}

function getStatusText(status: string): string {
  switch (status) {
    case 'responded': return 'טופל';
    case 'in_progress': return 'במעקב';
    case 'needs_parent_action': return 'נדרש המשך טיפול מההורה';
    case 'escalated': return 'הוסלם לגורם נוסף';
    default: return status;
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'responded': return '#16a34a';
    case 'in_progress': return '#8b5cf6';
    case 'needs_parent_action': return '#f59e0b';
    case 'escalated': return '#ef4444';
    default: return '#6b7280';
  }
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      to, 
      parent_name,
      child_name, 
      teacher_name,
      teacher_response, 
      action_taken,
      status
    }: TeacherFeedbackEmailRequest = await req.json();

    // Validate required fields
    if (!to || !child_name || !teacher_response || !status) {
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

    const statusText = getStatusText(status);
    const statusColor = getStatusColor(status);

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
            <div style="background: linear-gradient(135deg, #059669 0%, #10b981 100%); padding: 24px; text-align: center;">
              <h1 style="margin: 0; color: white; font-size: 24px;">✅ משוב מהמורה</h1>
              <p style="margin: 8px 0 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">SafeKids Guardian</p>
            </div>
            
            <!-- Content -->
            <div style="padding: 24px;">
              ${parent_name ? `<p style="margin: 0 0 16px 0; color: #374151; font-size: 16px;">שלום ${parent_name},</p>` : '<p style="margin: 0 0 16px 0; color: #374151; font-size: 16px;">שלום,</p>'}
              
              <p style="margin: 0 0 20px 0; color: #374151; font-size: 16px;">
                ${teacher_name ? `${teacher_name}` : 'המורה'} שלח/ה משוב בנוגע להתראה שהעברת על <strong>${child_name}</strong>.
              </p>
              
              <!-- Status Badge -->
              <div style="text-align: center; margin-bottom: 20px;">
                <span style="display: inline-block; background: ${statusColor}; color: white; padding: 8px 20px; border-radius: 20px; font-weight: bold; font-size: 14px;">
                  סטטוס: ${statusText}
                </span>
              </div>
              
              <!-- Teacher Response -->
              <div style="background: #eff6ff; border-radius: 8px; padding: 16px; border-right: 4px solid #3b82f6;">
                <h3 style="margin: 0 0 12px 0; color: #1e40af; font-size: 14px;">משוב המורה:</h3>
                <p style="margin: 0; color: #1e3a8a; font-size: 16px; line-height: 1.6; white-space: pre-wrap;">${teacher_response}</p>
              </div>
              
              ${action_taken ? `
              <div style="background: #f3f4f6; border-radius: 8px; padding: 16px; margin-top: 16px;">
                <h3 style="margin: 0 0 8px 0; color: #374151; font-size: 14px;">פעולה שבוצעה:</h3>
                <p style="margin: 0; color: #4b5563; font-size: 14px;">${action_taken}</p>
              </div>
              ` : ''}
              
              <!-- CTA -->
              <div style="text-align: center; margin-top: 24px;">
                <p style="margin: 0; color: #6b7280; font-size: 14px;">
                  לצפייה בפרטים המלאים ולתקשורת נוספת עם המורה, התחבר/י לאפליקציה.
                </p>
              </div>
              
              <!-- Footer Note -->
              <p style="margin-top: 24px; text-align: center; color: #9ca3af; font-size: 12px;">
                הודעה זו נשלחה אוטומטית ממערכת SafeKids Guardian.<br>
                אנו כאן בשבילך ובשביל המשפחה.
              </p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    console.log(`Sending teacher feedback email to ${to} for child ${child_name}`);

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "SafeKids <noreply@safekidss.com>",
        to: [to],
        subject: `✅ משוב מהמורה בנוגע ל${child_name}`,
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

    console.log("Teacher feedback email sent successfully:", emailData);

    return new Response(
      JSON.stringify({ success: true, message_id: emailData.id }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error sending teacher feedback email:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
