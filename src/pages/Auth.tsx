import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Shield, Mail, Lock, User, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';

const emailSchema = z.string().email('כתובת אימייל לא תקינה');

const signupSchema = z.object({
  fullName: z.string().min(2, 'שם חייב להכיל לפחות 2 תווים'),
  email: z.string().email('כתובת אימייל לא תקינה'),
  password: z.string().min(6, 'הסיסמה חייבת להכיל לפחות 6 תווים'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'הסיסמאות אינן תואמות',
  path: ['confirmPassword'],
});

type LoginStep = 'email' | 'otp';

export default function Auth() {
  const navigate = useNavigate();
  const { signUp, signInWithOtp, verifyOtp, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Login form - OTP flow
  const [loginStep, setLoginStep] = useState<LoginStep>('email');
  const [loginEmail, setLoginEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');

  // Signup form
  const [signupFullName, setSignupFullName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirmPassword, setSignupConfirmPassword] = useState('');

  // Redirect if already logged in
  if (user) {
    navigate('/');
    return null;
  }

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const result = emailSchema.safeParse(loginEmail);
    if (!result.success) {
      toast.error(result.error.errors[0].message);
      return;
    }

    setLoading(true);
    const { error } = await signInWithOtp(loginEmail);
    setLoading(false);

    if (error) {
      toast.error('שגיאה בשליחת קוד האימות: ' + error.message);
      return;
    }

    toast.success('קוד אימות נשלח למייל שלך');
    setLoginStep('otp');
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (otpCode.length !== 6) {
      toast.error('יש להזין קוד בן 6 ספרות');
      return;
    }

    setLoading(true);
    const { error, userExists, magicLink } = await verifyOtp(loginEmail, otpCode);
    setLoading(false);

    if (error) {
      toast.error(error.message || 'קוד אימות שגוי או פג תוקף');
      return;
    }

    // If magic link was returned, user will be redirected
    if (magicLink) {
      toast.success('מעביר אותך...');
      return;
    }

    // If user doesn't exist, they need to sign up
    if (userExists === false) {
      toast.info('האימייל לא רשום במערכת. אנא הירשם תחילה.');
      setLoginStep('email');
      return;
    }

    toast.success('התחברת בהצלחה!');
    navigate('/');
  };

  const handleBackToEmail = () => {
    setLoginStep('email');
    setOtpCode('');
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const result = signupSchema.safeParse({
      fullName: signupFullName,
      email: signupEmail,
      password: signupPassword,
      confirmPassword: signupConfirmPassword,
    });
    
    if (!result.success) {
      toast.error(result.error.errors[0].message);
      return;
    }

    setLoading(true);
    const { error } = await signUp(signupEmail, signupPassword, signupFullName);
    setLoading(false);

    if (error) {
      if (error.message.includes('already registered')) {
        toast.error('כתובת האימייל כבר רשומה במערכת');
      } else {
        toast.error('שגיאה בהרשמה: ' + error.message);
      }
      return;
    }

    toast.success('נרשמת בהצלחה! כעת תוכל/י להתחבר.');
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8 animate-slide-up">
        {/* Logo */}
        <div className="text-center">
          <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-primary to-cyan-500 flex items-center justify-center shadow-lg shadow-primary/30 mb-6">
            <Shield className="w-10 h-10 text-primary-foreground" />
          </div>
          <h1 className="font-heebo text-3xl font-bold text-gradient">SafeKids Guardian</h1>
          <p className="text-muted-foreground mt-2">הגנה חכמה למשפחה</p>
        </div>

        {/* Auth Card */}
        <Card>
          <CardContent className="pt-6">
            <Tabs defaultValue="login" className="w-full" dir="rtl">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="login">התחברות</TabsTrigger>
                <TabsTrigger value="signup">הרשמה</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                {loginStep === 'email' ? (
                  <form onSubmit={handleSendOtp} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="login-email">אימייל</Label>
                      <div className="relative">
                        <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="login-email"
                          type="email"
                          value={loginEmail}
                          onChange={(e) => setLoginEmail(e.target.value)}
                          placeholder="email@example.com"
                          className="pr-10"
                          dir="ltr"
                        />
                      </div>
                    </div>

                    <p className="text-sm text-muted-foreground text-center">
                      נשלח קוד אימות חד פעמי למייל שלך
                    </p>

                    <Button type="submit" variant="glow" className="w-full" disabled={loading}>
                      {loading ? 'שולח קוד...' : 'שלח קוד אימות'}
                    </Button>
                  </form>
                ) : (
                  <form onSubmit={handleVerifyOtp} className="space-y-4">
                    <button
                      type="button"
                      onClick={handleBackToEmail}
                      className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ArrowRight className="w-4 h-4" />
                      חזרה לאימייל
                    </button>

                    <div className="text-center space-y-2">
                      <p className="text-sm text-muted-foreground">
                        הזן את הקוד שנשלח אל
                      </p>
                      <p className="font-medium" dir="ltr">{loginEmail}</p>
                    </div>

                    <div className="flex justify-center py-4">
                      <InputOTP
                        maxLength={6}
                        value={otpCode}
                        onChange={setOtpCode}
                      >
                        <InputOTPGroup>
                          <InputOTPSlot index={0} />
                          <InputOTPSlot index={1} />
                          <InputOTPSlot index={2} />
                          <InputOTPSlot index={3} />
                          <InputOTPSlot index={4} />
                          <InputOTPSlot index={5} />
                        </InputOTPGroup>
                      </InputOTP>
                    </div>

                    <p className="text-xs text-muted-foreground text-center">
                      הקוד תקף ל-10 דקות
                    </p>

                    <Button type="submit" variant="glow" className="w-full" disabled={loading || otpCode.length !== 6}>
                      {loading ? 'מאמת...' : 'התחברות'}
                    </Button>

                    <button
                      type="button"
                      onClick={handleSendOtp}
                      className="w-full text-sm text-primary hover:underline"
                      disabled={loading}
                    >
                      לא קיבלת? שלח שוב
                    </button>
                  </form>
                )}
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={handleSignup} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">שם מלא</Label>
                    <div className="relative">
                      <User className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="signup-name"
                        type="text"
                        value={signupFullName}
                        onChange={(e) => setSignupFullName(e.target.value)}
                        placeholder="ישראל ישראלי"
                        className="pr-10"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-email">אימייל</Label>
                    <div className="relative">
                      <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="signup-email"
                        type="email"
                        value={signupEmail}
                        onChange={(e) => setSignupEmail(e.target.value)}
                        placeholder="email@example.com"
                        className="pr-10"
                        dir="ltr"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-password">סיסמה</Label>
                    <div className="relative">
                      <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="signup-password"
                        type={showPassword ? 'text' : 'password'}
                        value={signupPassword}
                        onChange={(e) => setSignupPassword(e.target.value)}
                        placeholder="••••••••"
                        className="pr-10 pl-10"
                        dir="ltr"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-confirm">אימות סיסמה</Label>
                    <div className="relative">
                      <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="signup-confirm"
                        type={showPassword ? 'text' : 'password'}
                        value={signupConfirmPassword}
                        onChange={(e) => setSignupConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        className="pr-10"
                        dir="ltr"
                      />
                    </div>
                  </div>

                  <Button type="submit" variant="glow" className="w-full" disabled={loading}>
                    {loading ? 'נרשם...' : 'הרשמה'}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Policy Link */}
        <p className="text-center text-sm text-muted-foreground">
          בהרשמה אתה מאשר את{' '}
          <Link to="/policy" className="text-primary hover:underline">
            מדיניות הפרטיות
          </Link>
        </p>
      </div>
    </div>
  );
}
