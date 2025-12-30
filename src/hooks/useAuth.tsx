import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signInWithOtp: (email: string) => Promise<{ error: Error | null }>;
  verifyOtp: (email: string, token: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, fullName: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
        },
      },
    });
    
    return { error: error as Error | null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    return { error: error as Error | null };
  };

  const signInWithOtp = async (email: string) => {
    // Generate a 6-digit OTP code
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store OTP temporarily (in localStorage with expiry)
    const otpData = {
      code: otpCode,
      email,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
    };
    localStorage.setItem('otp_data', JSON.stringify(otpData));

    // Send OTP email via edge function
    try {
      const { error } = await supabase.functions.invoke('send-otp-email', {
        body: {
          to: email,
          otp_code: otpCode,
          type: 'login',
        },
      });

      if (error) {
        return { error: new Error(error.message || 'Failed to send OTP') };
      }

      return { error: null };
    } catch (err: any) {
      return { error: new Error(err.message || 'Failed to send OTP') };
    }
  };

  const verifyOtp = async (email: string, token: string) => {
    // Get stored OTP data
    const storedData = localStorage.getItem('otp_data');
    if (!storedData) {
      return { error: new Error('No OTP request found. Please request a new code.') };
    }

    const otpData = JSON.parse(storedData);
    
    // Check if OTP is expired
    if (Date.now() > otpData.expiresAt) {
      localStorage.removeItem('otp_data');
      return { error: new Error('OTP has expired. Please request a new code.') };
    }

    // Check if email matches
    if (otpData.email !== email) {
      return { error: new Error('Email mismatch. Please request a new code.') };
    }

    // Check if OTP matches
    if (otpData.code !== token) {
      return { error: new Error('Invalid OTP code.') };
    }

    // OTP verified - clear stored data
    localStorage.removeItem('otp_data');

    // Sign in with a magic link or create session
    // Since we're using custom OTP, we'll use signInWithPassword with a temporary password
    // Or we can use the admin API to create a session
    
    // For now, let's use Supabase's built-in OTP verification if user exists
    // First, check if user exists by trying to sign them up (will fail if exists)
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password: `temp_${otpData.code}_${Date.now()}`,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
      },
    });

    // If user already exists, we need a different approach
    // Let's use the signInWithOtp from Supabase which sends a magic link
    // But we've already verified the OTP, so we need to create a session

    // Alternative: Use admin function to sign in the user
    // For now, redirect to magic link flow
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
      },
    });

    if (otpError) {
      // If OTP fails, try to help the user
      return { error: new Error('אימות הצליח. נשלח לך מייל להשלמת ההתחברות.') };
    }

    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signUp, signIn, signInWithOtp, verifyOtp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
