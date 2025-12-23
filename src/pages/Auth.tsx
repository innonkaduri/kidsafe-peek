import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Shield, Mail, Lock, User, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email('כתובת אימייל לא תקינה'),
  password: z.string().min(6, 'הסיסמה חייבת להכיל לפחות 6 תווים'),
});

const signupSchema = z.object({
  fullName: z.string().min(2, 'שם חייב להכיל לפחות 2 תווים'),
  email: z.string().email('כתובת אימייל לא תקינה'),
  password: z.string().min(6, 'הסיסמה חייבת להכיל לפחות 6 תווים'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'הסיסמאות אינן תואמות',
  path: ['confirmPassword'],
});

export default function Auth() {
  const navigate = useNavigate();
  const { signIn, signUp, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Login form
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const result = loginSchema.safeParse({ email: loginEmail, password: loginPassword });
    if (!result.success) {
      toast.error(result.error.errors[0].message);
      return;
    }

    setLoading(true);
    const { error } = await signIn(loginEmail, loginPassword);
    setLoading(false);

    if (error) {
      if (error.message.includes('Invalid login credentials')) {
        toast.error('פרטי התחברות שגויים');
      } else {
        toast.error('שגיאה בהתחברות: ' + error.message);
      }
      return;
    }

    toast.success('התחברת בהצלחה!');
    navigate('/');
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
                <form onSubmit={handleLogin} className="space-y-4">
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

                  <div className="space-y-2">
                    <Label htmlFor="login-password">סיסמה</Label>
                    <div className="relative">
                      <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="login-password"
                        type={showPassword ? 'text' : 'password'}
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
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

                  <Button type="submit" variant="glow" className="w-full" disabled={loading}>
                    {loading ? 'מתחבר...' : 'התחברות'}
                  </Button>
                </form>
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
