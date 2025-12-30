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
  verifyOtp: (email: string, token: string) => Promise<{ error: Error | null; userExists?: boolean; magicLink?: string }>;
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
    try {
      const { data, error } = await supabase.functions.invoke('send-otp-email', {
        body: {
          to: email,
          type: 'login',
        },
      });

      if (error) {
        return { error: new Error(error.message || 'Failed to send OTP') };
      }

      if (!data?.success) {
        return { error: new Error(data?.error || 'Failed to send OTP') };
      }

      return { error: null };
    } catch (err: any) {
      return { error: new Error(err.message || 'Failed to send OTP') };
    }
  };

  const verifyOtp = async (email: string, token: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('verify-otp', {
        body: {
          email,
          code: token,
          type: 'login',
        },
      });

      if (error) {
        return { error: new Error(error.message || 'Failed to verify OTP') };
      }

      if (!data?.success) {
        return { error: new Error(data?.error || 'Invalid OTP code') };
      }

      // If we got a magic link, use it to sign in
      if (data.magic_link) {
        // Extract the token from the magic link and use it
        const url = new URL(data.magic_link);
        const tokenHash = url.searchParams.get('token_hash') || url.hash.split('access_token=')[1]?.split('&')[0];
        
        if (tokenHash) {
          // Try to verify the token
          const { error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: 'magiclink',
          });
          
          if (verifyError) {
            // If direct verification fails, redirect to the magic link
            window.location.href = data.magic_link;
            return { error: null, userExists: true, magicLink: data.magic_link };
          }
        } else {
          // Redirect to magic link
          window.location.href = data.magic_link;
          return { error: null, userExists: true, magicLink: data.magic_link };
        }
      }

      return { 
        error: null, 
        userExists: data.user_exists,
      };
    } catch (err: any) {
      return { error: new Error(err.message || 'Failed to verify OTP') };
    }
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
