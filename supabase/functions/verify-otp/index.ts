import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface VerifyOtpRequest {
  email: string;
  code: string;
  type: 'login' | 'password_reset';
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, code, type }: VerifyOtpRequest = await req.json();

    // Validate required fields
    if (!email || !code || !type) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Find matching OTP
    const { data: otpData, error: otpError } = await supabase
      .from('otp_codes')
      .select('*')
      .eq('email', email)
      .eq('code', code)
      .eq('type', type)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (otpError || !otpData) {
      console.log("OTP verification failed:", otpError);
      return new Response(
        JSON.stringify({ success: false, error: "Invalid or expired OTP code" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Mark OTP as used
    await supabase
      .from('otp_codes')
      .update({ used_at: new Date().toISOString() })
      .eq('id', otpData.id);

    // Check if user exists
    const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers();
    const existingUser = users?.find(u => u.email === email);

    if (type === 'login') {
      if (existingUser) {
        // User exists - create a session using magic link
        const { data: signInData, error: signInError } = await supabase.auth.admin.generateLink({
          type: 'magiclink',
          email,
          options: {
            redirectTo: `${req.headers.get('origin') || 'https://safekids.app'}/`,
          },
        });

        if (signInError) {
          console.error("Error generating magic link:", signInError);
          return new Response(
            JSON.stringify({ 
              success: true, 
              verified: true,
              user_exists: true,
              message: "OTP verified. Please check your email for login link." 
            }),
            { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        }

        return new Response(
          JSON.stringify({ 
            success: true, 
            verified: true,
            user_exists: true,
            magic_link: signInData.properties?.action_link,
          }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      } else {
        // New user - they need to sign up
        return new Response(
          JSON.stringify({ 
            success: true, 
            verified: true,
            user_exists: false,
            message: "OTP verified. Please complete registration." 
          }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    if (type === 'password_reset') {
      if (!existingUser) {
        return new Response(
          JSON.stringify({ success: false, error: "User not found" }),
          { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      // Generate password reset token
      const { data: resetData, error: resetError } = await supabase.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: {
          redirectTo: `${req.headers.get('origin') || 'https://safekids.app'}/auth?reset=true`,
        },
      });

      if (resetError) {
        console.error("Error generating reset link:", resetError);
        return new Response(
          JSON.stringify({ success: false, error: "Failed to generate reset link" }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          verified: true,
          reset_token: resetData.properties?.hashed_token,
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, verified: true }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error verifying OTP:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
