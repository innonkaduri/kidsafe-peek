import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface OtpEmailRequest {
  to: string;
  type: 'login' | 'password_reset';
  user_name?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { to, type, user_name }: OtpEmailRequest = await req.json();

    // Validate required fields
    if (!to || !type) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields: to, type" }),
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

    // Generate 6-digit OTP
    const otp_code = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store OTP in database using service role
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    
    // Delete any existing OTP for this email
    await supabase
      .from('otp_codes')
      .delete()
      .eq('email', to)
      .eq('type', type);
    
    // Insert new OTP (expires in 10 minutes)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const { error: insertError } = await supabase
      .from('otp_codes')
      .insert({
        email: to,
        code: otp_code,
        type,
        expires_at: expiresAt,
      });

    if (insertError) {
      console.error("Error storing OTP:", insertError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to generate OTP" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const isPasswordReset = type === 'password_reset';
    const title = isPasswordReset ? 'איפוס סיסמה' : 'אימות התחברות';
    const subtitle = isPasswordReset 
      ? 'קיבלנו בקשה לאיפוס הסיסמה שלך'
      : 'הזן את הקוד הבא כדי להתחבר לחשבון שלך';

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
              <h1 style="margin: 0; color: white; font-size: 24px;">🔐 ${title}</h1>
              <p style="margin: 8px 0 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">SafeKids Guardian</p>
            </div>
            
            <!-- Content -->
            <div style="padding: 32px;">
              ${user_name ? `<p style="margin: 0 0 16px 0; color: #374151; font-size: 16px;">שלום ${user_name},</p>` : ''}
              
              <p style="margin: 0 0 24px 0; color: #374151; font-size: 16px;">
                ${subtitle}
              </p>
              
              <!-- OTP Code -->
              <div style="text-align: center; margin: 32px 0;">
                <div style="display: inline-block; background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); color: white; padding: 20px 40px; border-radius: 12px; font-size: 32px; font-weight: bold; letter-spacing: 8px;">
                  ${otp_code}
                </div>
              </div>
              
              <p style="margin: 0; text-align: center; color: #6b7280; font-size: 14px;">
                הקוד יפוג בעוד 10 דקות
              </p>
              
              ${isPasswordReset ? `
              <div style="margin-top: 24px; padding: 16px; background: #fef3c7; border-radius: 8px; border-right: 4px solid #f59e0b;">
                <p style="margin: 0; color: #92400e; font-size: 14px;">
                  <strong>שים לב:</strong> אם לא ביקשת לאפס את הסיסמה, התעלם מהודעה זו.
                </p>
              </div>
              ` : ''}
              
              <!-- Footer Note -->
              <p style="margin-top: 32px; text-align: center; color: #9ca3af; font-size: 12px;">
                הודעה זו נשלחה אוטומטית ממערכת SafeKids Guardian.<br>
                אין להשיב להודעה זו.
              </p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    console.log(`Sending ${type} OTP email to ${to}`);

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "SafeKids <onboarding@resend.dev>",
        to: [to],
        subject: `🔐 ${title} - SafeKids`,
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

    console.log("OTP Email sent successfully:", emailData);

    return new Response(
      JSON.stringify({ success: true, message_id: emailData.id }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error sending OTP email:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
