import { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, User, CheckCircle, Smartphone, Loader2, QrCode, Wifi, ArrowRight, ArrowLeft, Shield, RefreshCw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { AgeRange } from '@/types/database';
import { useNavigate } from 'react-router-dom';

interface AddChildDialogProps {
  onChildAdded: () => void;
}

type WizardStep = 'info' | 'connect' | 'syncing';

type ConnectionStatus = 
  | 'idle'
  | 'creating' 
  | 'waiting_scan' 
  | 'connected' 
  | 'error';

const CREATION_DURATION_MS = 120000;

export function AddChildDialog({ onChildAdded }: AddChildDialogProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [ageRange, setAgeRange] = useState<AgeRange | ''>('');
  const [consentAck, setConsentAck] = useState(false);
  
  // Wizard state
  const [step, setStep] = useState<WizardStep>('info');
  const [createdChildId, setCreatedChildId] = useState<string | null>(null);
  
  // Connection state
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [creationProgress, setCreationProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState(0);
  
  // Refs for intervals
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const qrRefreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const creationTimerRef = useRef<NodeJS.Timeout | null>(null);

  const clearAllIntervals = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (qrRefreshIntervalRef.current) {
      clearInterval(qrRefreshIntervalRef.current);
      qrRefreshIntervalRef.current = null;
    }
    if (creationTimerRef.current) {
      clearInterval(creationTimerRef.current);
      creationTimerRef.current = null;
    }
  }, []);

  // Cleanup on unmount or dialog close
  useEffect(() => {
    if (!open) {
      clearAllIntervals();
    }
    return () => clearAllIntervals();
  }, [open, clearAllIntervals]);

  const resetWizard = () => {
    setStep('info');
    setCreatedChildId(null);
    setConnectionStatus('idle');
    setQrCode(null);
    setCreationProgress(0);
    setErrorMessage(null);
    setSyncProgress(0);
    setDisplayName('');
    setAgeRange('');
    setConsentAck(false);
    clearAllIntervals();
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      resetWizard();
    }
  };

  // Step 1: Create child profile
  const handleCreateChild = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      toast.error('יש להתחבר תחילה');
      return;
    }

    if (!displayName.trim()) {
      toast.error('נא להזין שם תצוגה');
      return;
    }

    if (!consentAck) {
      toast.error('יש לאשר את הסכמת הילד/ה לניטור');
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.from('children').insert({
        user_id: user.id,
        display_name: displayName.trim(),
        age_range: ageRange || null,
        consent_ack_at: new Date().toISOString(),
        monitoring_enabled: true,
      }).select().single();

      if (error) throw error;

      setCreatedChildId(data.id);
      setStep('connect');
      toast.success('פרופיל נוצר! כעת נחבר את WhatsApp');
      
      // Start creating WhatsApp instance
      await createWhatsAppInstance(data.id);
      
    } catch (error: any) {
      toast.error('שגיאה ביצירת הפרופיל: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Create WhatsApp instance and show QR
  const createWhatsAppInstance = async (childId: string) => {
    setConnectionStatus('creating');
    setErrorMessage(null);
    setCreationProgress(0);
    
    const startTime = Date.now();
    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min((elapsed / CREATION_DURATION_MS) * 100, 95);
      setCreationProgress(progress);
    }, 100);
    creationTimerRef.current = progressInterval;
    
    try {
      const { data, error } = await supabase.functions.invoke('green-api-partner', {
        body: { action: 'createInstance', child_id: childId },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      if (data.status === 'already_connected') {
        clearInterval(progressInterval);
        creationTimerRef.current = null;
        setCreationProgress(100);
        setConnectionStatus('connected');
        toast.success('WhatsApp כבר מחובר!');
        await startSyncing(childId);
        return;
      }

      // Wait for visual progress
      const remainingTime = Math.max(0, CREATION_DURATION_MS - (Date.now() - startTime));
      if (remainingTime > 0) {
        await new Promise(resolve => setTimeout(resolve, remainingTime));
      }
      
      clearInterval(progressInterval);
      creationTimerRef.current = null;
      setCreationProgress(100);
      
      // Wait for instance to be ready
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Fetch QR and start polling
      await fetchQR(childId);
      
    } catch (error: any) {
      clearInterval(progressInterval);
      creationTimerRef.current = null;
      console.error('Create instance error:', error);
      setErrorMessage(error.message || 'שגיאה ביצירת מופע');
      setConnectionStatus('error');
    }
  };

  const fetchQR = async (childId: string) => {
    try {
      setErrorMessage(null);
      
      const { data, error } = await supabase.functions.invoke('green-api-qr', {
        body: { action: 'qr', child_id: childId },
      });

      if (error) throw error;

      if (data.type === 'qrCode' && data.message) {
        setQrCode(data.message);
        setConnectionStatus('waiting_scan');
        
        // Start polling for connection status
        pollIntervalRef.current = setInterval(async () => {
          const connected = await checkConnectionStatus(childId);
          if (connected) {
            clearAllIntervals();
            await startSyncing(childId);
          }
        }, 5000);
        
        // Refresh QR every 30 seconds
        qrRefreshIntervalRef.current = setInterval(() => fetchQR(childId), 30000);
        
      } else if (data.type === 'alreadyLogged') {
        setConnectionStatus('connected');
        setQrCode(null);
        clearAllIntervals();
        await startSyncing(childId);
      } else if (data.type === 'error') {
        if (!data.rateLimited) {
          setErrorMessage(data.message || 'שגיאה בקבלת QR');
          setConnectionStatus('error');
        }
      }
    } catch (error: any) {
      console.error('QR fetch error:', error);
      setErrorMessage(error.message || 'שגיאה בחיבור');
      setConnectionStatus('error');
    }
  };

  const checkConnectionStatus = async (childId: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase.functions.invoke('green-api-partner', {
        body: { action: 'getStatus', child_id: childId },
      });

      if (error) return false;

      if (data.status === 'authorized') {
        setConnectionStatus('connected');
        setQrCode(null);
        return true;
      }

      return false;
    } catch {
      return false;
    }
  };

  const startSyncing = async (childId: string) => {
    setStep('syncing');
    setSyncProgress(0);
    
    // Animate progress
    const progressInterval = setInterval(() => {
      setSyncProgress(prev => Math.min(prev + 5, 90));
    }, 200);
    
    try {
      // Wait a moment for WhatsApp to be fully ready
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const { data, error } = await supabase.functions.invoke('green-api-fetch', {
        body: { child_id: childId },
      });

      clearInterval(progressInterval);
      setSyncProgress(100);

      if (error) throw error;

      if (data.messagesImported > 0) {
        toast.success(`נטענו ${data.messagesImported} הודעות מ-${data.chatsProcessed} שיחות`);
      } else {
        toast.success('החיבור הושלם בהצלחה!');
      }

      // Wait a moment then navigate
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      setOpen(false);
      onChildAdded();
      navigate(`/child/${childId}`);
      
    } catch (error: any) {
      clearInterval(progressInterval);
      setSyncProgress(100);
      console.error('Sync error:', error);
      // Still navigate even if sync fails - can sync later
      toast.info('החיבור הושלם, הסנכרון יתבצע ברקע');
      await new Promise(resolve => setTimeout(resolve, 1000));
      setOpen(false);
      onChildAdded();
      navigate(`/child/${childId}`);
    }
  };

  const handleRetry = async () => {
    if (createdChildId) {
      setConnectionStatus('idle');
      setErrorMessage(null);
      await createWhatsAppInstance(createdChildId);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="glow" size="lg" className="gap-2">
          <Plus className="w-5 h-5" />
          הוספת ילד/ה
        </Button>
      </DialogTrigger>
      <DialogContent className="glass-card border-border sm:max-w-md">
        {/* Step 1: Child Info */}
        {step === 'info' && (
          <>
            <DialogHeader>
              <DialogTitle className="font-heebo text-xl">הוספת פרופיל ילד/ה</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                צרו פרופיל חדש לניטור בטיחות
              </DialogDescription>
            </DialogHeader>
            
            <form onSubmit={handleCreateChild} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="displayName">שם תצוגה</Label>
                <div className="relative">
                  <User className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="displayName"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="הזינו שם או כינוי"
                    className="pr-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ageRange">טווח גילאים</Label>
                <Select value={ageRange} onValueChange={(v) => setAgeRange(v as AgeRange)}>
                  <SelectTrigger>
                    <SelectValue placeholder="בחרו טווח גילאים" />
                  </SelectTrigger>
                  <SelectContent className="glass-card border-border">
                    <SelectItem value="6-9">6-9 שנים</SelectItem>
                    <SelectItem value="10-12">10-12 שנים</SelectItem>
                    <SelectItem value="13-15">13-15 שנים</SelectItem>
                    <SelectItem value="16-18">16-18 שנים</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="glass-card p-4 rounded-xl space-y-3">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="consent"
                    checked={consentAck}
                    onCheckedChange={(checked) => setConsentAck(checked as boolean)}
                  />
                  <div className="space-y-1">
                    <Label htmlFor="consent" className="text-sm font-medium cursor-pointer">
                      אישור הסכמה
                    </Label>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      אני מאשר/ת שהילד/ה מודע/ת לניטור ההודעות ומסכים/ה לכך. 
                      הניטור נעשה למטרות בטיחות בלבד.
                    </p>
                  </div>
                </div>
              </div>

              <Button type="submit" variant="glow" className="w-full gap-2" disabled={loading}>
                {loading ? (
                  <span className="animate-pulse">יוצר פרופיל...</span>
                ) : (
                  <>
                    המשך לחיבור WhatsApp
                    <ArrowLeft className="w-4 h-4" />
                  </>
                )}
              </Button>
            </form>
          </>
        )}

        {/* Step 2: WhatsApp Connection */}
        {step === 'connect' && (
          <>
            <DialogHeader>
              <DialogTitle className="font-heebo text-xl flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-primary" />
                חיבור WhatsApp
              </DialogTitle>
              <DialogDescription className="text-muted-foreground">
                סרקו את הקוד עם WhatsApp לחיבור המכשיר של {displayName}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 py-4">
              {/* Creating Instance */}
              {connectionStatus === 'creating' && (
                <div className="flex flex-col items-center gap-6 py-4">
                  <div className="relative">
                    <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center animate-pulse">
                      <Shield className="w-10 h-10 text-primary" />
                    </div>
                    <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-background border-2 border-primary flex items-center justify-center">
                      <Loader2 className="w-3 h-3 animate-spin text-primary" />
                    </div>
                  </div>
                  <div className="text-center space-y-2">
                    <h3 className="font-medium text-foreground">יוצר חיבור מאובטח</h3>
                    <p className="text-sm text-muted-foreground">מכין את המערכת לקליטת הודעות...</p>
                  </div>
                  <div className="w-full max-w-xs space-y-2">
                    <Progress value={creationProgress} className="h-2" />
                    <p className="text-xs text-muted-foreground/60 text-center">
                      {creationProgress < 30 && 'מאתחל חיבור...'}
                      {creationProgress >= 30 && creationProgress < 60 && 'מגדיר הצפנה...'}
                      {creationProgress >= 60 && creationProgress < 90 && 'מחבר לשרתים...'}
                      {creationProgress >= 90 && 'כמעט מוכן...'}
                    </p>
                  </div>
                </div>
              )}

              {/* QR Code Display */}
              {connectionStatus === 'waiting_scan' && qrCode && (
                <div className="flex flex-col items-center gap-4">
                  <div className="bg-white p-4 rounded-2xl shadow-lg">
                    <img 
                      src={`data:image/png;base64,${qrCode}`} 
                      alt="WhatsApp QR Code"
                      className="w-56 h-56"
                    />
                  </div>
                  <div className="text-center space-y-2">
                    <p className="text-sm text-muted-foreground">
                      פתחו את WhatsApp בטלפון → הגדרות → מכשירים מקושרים → קשר מכשיר
                    </p>
                    <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground/60">
                      <QrCode className="w-3 h-3" />
                      הקוד מתרענן אוטומטית
                    </div>
                  </div>
                </div>
              )}

              {/* Connected */}
              {connectionStatus === 'connected' && (
                <div className="flex flex-col items-center gap-4 py-4">
                  <div className="w-20 h-20 rounded-full bg-success/20 flex items-center justify-center">
                    <CheckCircle className="w-10 h-10 text-success" />
                  </div>
                  <div className="text-center">
                    <h3 className="font-medium text-foreground">WhatsApp מחובר!</h3>
                    <p className="text-sm text-muted-foreground">מסנכרן הודעות...</p>
                  </div>
                </div>
              )}

              {/* Error */}
              {connectionStatus === 'error' && (
                <div className="flex flex-col items-center gap-4 py-4">
                  <div className="text-center space-y-4">
                    <p className="text-sm text-destructive">{errorMessage}</p>
                    <Button onClick={handleRetry} variant="outline" className="gap-2">
                      <RefreshCw className="w-4 h-4" />
                      נסה שוב
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Step 3: Syncing */}
        {step === 'syncing' && (
          <>
            <DialogHeader>
              <DialogTitle className="font-heebo text-xl flex items-center gap-2">
                <Wifi className="w-5 h-5 text-success" />
                מסנכרן הודעות
              </DialogTitle>
              <DialogDescription className="text-muted-foreground">
                טוען את ההודעות מחשבון ה-WhatsApp של {displayName}
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col items-center gap-6 py-8">
              <div className="relative">
                <div className="w-20 h-20 rounded-full bg-success/20 flex items-center justify-center">
                  <CheckCircle className="w-10 h-10 text-success" />
                </div>
                {syncProgress < 100 && (
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-background border-2 border-success flex items-center justify-center">
                    <Loader2 className="w-3 h-3 animate-spin text-success" />
                  </div>
                )}
              </div>
              
              <div className="w-full max-w-xs space-y-2">
                <Progress value={syncProgress} className="h-2" />
                <p className="text-sm text-muted-foreground text-center">
                  {syncProgress < 50 && 'מתחבר לשרת...'}
                  {syncProgress >= 50 && syncProgress < 90 && 'טוען הודעות...'}
                  {syncProgress >= 90 && 'מסיים...'}
                </p>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
