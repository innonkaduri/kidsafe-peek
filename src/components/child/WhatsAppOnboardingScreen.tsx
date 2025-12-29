import { useState, useEffect, useRef, useCallback } from 'react';
import { Smartphone, Loader2, Shield, Plus, RefreshCw, QrCode, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Child } from '@/types/database';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface WhatsAppOnboardingScreenProps {
  child: Child;
  onConnected: () => void;
}

type ConnectionStatus = 
  | 'loading' 
  | 'no_instance' 
  | 'creating' 
  | 'waiting_scan' 
  | 'connected';

const CREATION_DURATION_MS = 120000;

export function WhatsAppOnboardingScreen({ child, onConnected }: WhatsAppOnboardingScreenProps) {
  const [status, setStatus] = useState<ConnectionStatus>('loading');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [creationProgress, setCreationProgress] = useState(0);
  
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const qrRefreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const creationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isInitializedRef = useRef(false);
  const isFetchingRef = useRef(false);

  const clearIntervals = useCallback(() => {
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

  const checkInstanceStatus = useCallback(async () => {
    if (isFetchingRef.current) return false;
    isFetchingRef.current = true;
    
    try {
      const { data, error } = await supabase.functions.invoke('green-api-partner', {
        body: { action: 'getStatus', child_id: child.id },
      });

      if (error) throw error;

      if (!data.hasInstance) {
        setStatus('no_instance');
        clearIntervals();
        return false;
      }

      if (data.status === 'authorized') {
        setStatus('connected');
        setQrCode(null);
        clearIntervals();
        toast.success('WhatsApp מחובר בהצלחה!');
        setTimeout(() => onConnected(), 1500);
        return true;
      }

      return false;
    } catch (error) {
      console.error('Status check error:', error);
      return false;
    } finally {
      isFetchingRef.current = false;
    }
  }, [child.id, clearIntervals, onConnected]);

  const fetchQR = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    
    try {
      setErrorMessage(null);
      
      const { data, error } = await supabase.functions.invoke('green-api-qr', {
        body: { action: 'qr', child_id: child.id },
      });

      if (error) throw error;

      if (data.type === 'noInstance') {
        setStatus('no_instance');
        clearIntervals();
        return;
      }

      // Instance is still initializing or server busy - keep waiting
      if (data.notReady || data.retryable || data.rateLimited) {
        console.log('Instance initializing or server busy, waiting...');
        return;
      }

      // Handle other errors gracefully
      if (data.type === 'error' && !data.message?.includes('already')) {
        console.log('QR fetch error, will retry:', data.message);
        return;
      }

      if (data.type === 'qrCode' && data.message) {
        setQrCode(data.message);
        setStatus('waiting_scan');
      } else if (data.type === 'alreadyLogged') {
        setStatus('connected');
        setQrCode(null);
        clearIntervals();
        toast.success('WhatsApp מחובר בהצלחה!');
        setTimeout(() => onConnected(), 1500);
      }
    } catch (error: any) {
      console.error('QR fetch error:', error);
    } finally {
      isFetchingRef.current = false;
    }
  }, [child.id, clearIntervals, onConnected]);

  // Initialize once on mount
  useEffect(() => {
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;

    const initialize = async () => {
      setStatus('loading');
      clearIntervals();
      
      const isConnected = await checkInstanceStatus();
      
      if (!isConnected) {
        const { data } = await supabase.functions.invoke('green-api-partner', {
          body: { action: 'getStatus', child_id: child.id },
        });

        if (data?.hasInstance) {
          setStatus('waiting_scan');
          
          // Fetch QR after delay
          setTimeout(fetchQR, 2000);
          
          // Poll for status every 15 seconds
          pollIntervalRef.current = setInterval(async () => {
            const connected = await checkInstanceStatus();
            if (connected) clearIntervals();
          }, 15000);
          
          // Refresh QR every 20 seconds
          qrRefreshIntervalRef.current = setInterval(fetchQR, 20000);
        } else {
          setStatus('no_instance');
        }
      }
    };

    initialize();
    
    return () => clearIntervals();
  }, [child.id, checkInstanceStatus, fetchQR, clearIntervals]);

  const createInstance = async (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    
    setStatus('creating');
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
        body: { action: 'createInstance', child_id: child.id },
      });

      if (error) throw error;

      if (data.error) {
        throw new Error(data.error);
      }

      if (data.status === 'already_connected') {
        clearInterval(progressInterval);
        creationTimerRef.current = null;
        setCreationProgress(100);
        toast.success('WhatsApp כבר מחובר!');
        setTimeout(() => onConnected(), 1500);
        return;
      }

      const remainingTime = Math.max(0, CREATION_DURATION_MS - (Date.now() - startTime));
      if (remainingTime > 0) {
        await new Promise(resolve => setTimeout(resolve, remainingTime));
      }
      
      clearInterval(progressInterval);
      creationTimerRef.current = null;
      setCreationProgress(100);
      
      toast.success('מופע נוצר בהצלחה! מחכה לסריקת QR...');
      
      // Start waiting for QR
      setStatus('waiting_scan');
      
      // Wait and then start polling
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Start fetching QR
      fetchQR();
      
      // Set up polling intervals
      pollIntervalRef.current = setInterval(async () => {
        const connected = await checkInstanceStatus();
        if (connected) clearIntervals();
      }, 15000);
      
      qrRefreshIntervalRef.current = setInterval(fetchQR, 20000);
      
    } catch (error: any) {
      clearInterval(progressInterval);
      creationTimerRef.current = null;
      console.error('Create instance error:', error);
      setErrorMessage(error.message || 'שגיאה ביצירת מופע');
      setStatus('no_instance');
      toast.error('שגיאה ביצירת חיבור: ' + error.message);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] animate-slide-up">
      <Card className="glass-card w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-400/20 to-blue-600/20 flex items-center justify-center border border-primary/30">
              <Smartphone className="w-8 h-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-xl text-foreground">
            חיבור WhatsApp עבור {child.display_name}
          </CardTitle>
          <CardDescription>
            כדי להתחיל לנטר את ההודעות, יש לחבר את WhatsApp של הילד
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Loading State */}
          {status === 'loading' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="w-12 h-12 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">בודק סטטוס חיבור...</p>
            </div>
          )}

          {/* No Instance State */}
          {status === 'no_instance' && (
            <div className="flex flex-col items-center gap-6 py-8">
              <div className="text-center space-y-3">
                <p className="text-muted-foreground">
                  לחצו על הכפתור כדי ליצור חיבור חדש
                </p>
              </div>
              {errorMessage && (
                <p className="text-sm text-destructive">{errorMessage}</p>
              )}
              <Button onClick={createInstance} variant="glow" size="lg" className="gap-2" type="button">
                <Plus className="w-5 h-5" />
                צור חיבור WhatsApp
              </Button>
            </div>
          )}

          {/* Creating State */}
          {status === 'creating' && (
            <div className="flex flex-col items-center gap-6 py-8">
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
                <p className="text-sm text-muted-foreground">
                  מכין את המערכת לקליטת הודעות...
                </p>
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

          {/* QR Code Display or Waiting for QR */}
          {status === 'waiting_scan' && (
            <div className="flex flex-col items-center gap-4 py-6">
              <Badge variant="outline" className="gap-1 border-primary/50 text-primary mb-2">
                <QrCode className="w-3 h-3" />
                {qrCode ? 'ממתין לסריקה' : 'מאתחל מופע...'}
              </Badge>
              
              {qrCode ? (
                <>
                  <div className="bg-white p-4 rounded-2xl shadow-lg">
                    <img 
                      src={`data:image/png;base64,${qrCode}`} 
                      alt="WhatsApp QR Code"
                      className="w-64 h-64"
                    />
                  </div>
                  <div className="text-center space-y-2">
                    <p className="text-sm text-muted-foreground">
                      פתחו את WhatsApp בטלפון → הגדרות → מכשירים מקושרים → קשר מכשיר
                    </p>
                    <p className="text-xs text-muted-foreground/60">
                      הקוד מתרענן אוטומטית
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={fetchQR} className="gap-2">
                    <RefreshCw className="w-4 h-4" />
                    רענן QR
                  </Button>
                </>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <div className="w-64 h-64 bg-muted/30 rounded-2xl flex items-center justify-center">
                    <Loader2 className="w-12 h-12 animate-spin text-primary" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    המופע מאותחל, ה-QR יופיע בקרוב...
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Connected State */}
          {status === 'connected' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="w-20 h-20 rounded-full bg-success/20 flex items-center justify-center">
                <CheckCircle className="w-10 h-10 text-success" />
              </div>
              <div className="text-center">
                <h3 className="font-medium text-foreground">WhatsApp מחובר!</h3>
                <p className="text-sm text-muted-foreground">
                  מעביר לפרופיל הילד...
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
