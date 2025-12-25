import { useState, useEffect, useRef, useCallback } from 'react';
import { Smartphone, Loader2, CheckCircle, RefreshCw, QrCode, Wifi, WifiOff, Plus, Unplug, Shield } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Child } from '@/types/database';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ConnectorTabProps {
  child: Child;
  onUpdate: () => void;
}

type ConnectionStatus = 
  | 'loading' 
  | 'no_instance' 
  | 'creating' 
  | 'waiting_scan' 
  | 'connected' 
  | 'error';

const CREATION_DURATION_MS = 120000; // 120 seconds = 2 minutes

export function ConnectorTab({ child, onUpdate }: ConnectorTabProps) {
  const [status, setStatus] = useState<ConnectionStatus>('loading');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [creationProgress, setCreationProgress] = useState(0);
  const creationTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const qrRefreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const autoSyncIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const clearIntervals = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (qrRefreshIntervalRef.current) {
      clearInterval(qrRefreshIntervalRef.current);
      qrRefreshIntervalRef.current = null;
    }
    if (autoSyncIntervalRef.current) {
      clearInterval(autoSyncIntervalRef.current);
      autoSyncIntervalRef.current = null;
    }
    if (creationTimerRef.current) {
      clearInterval(creationTimerRef.current);
      creationTimerRef.current = null;
    }
  }, []);

  const checkInstanceStatus = useCallback(async () => {
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
        return true;
      }

      return false;
    } catch (error) {
      console.error('Status check error:', error);
      return false;
    }
  }, [child.id, clearIntervals]);

  const fetchQR = useCallback(async () => {
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

      if (data.type === 'qrCode' && data.message) {
        setQrCode(data.message);
        setStatus('waiting_scan');
      } else if (data.type === 'alreadyLogged') {
        setStatus('connected');
        setQrCode(null);
        clearIntervals();
      } else if (data.type === 'error') {
        if (!data.rateLimited) {
          setErrorMessage(data.message || 'שגיאה בקבלת QR');
        }
      }
    } catch (error: any) {
      console.error('QR fetch error:', error);
      setErrorMessage(error.message || 'שגיאה בחיבור');
    }
  }, [child.id, clearIntervals]);

  const initializeConnection = useCallback(async () => {
    setStatus('loading');
    clearIntervals();
    
    const isConnected = await checkInstanceStatus();
    
    if (!isConnected) {
      // Check if we have an instance
      const { data } = await supabase.functions.invoke('green-api-partner', {
        body: { action: 'getStatus', child_id: child.id },
      });

      if (data?.hasInstance) {
        // Instance exists but not connected, fetch QR
        await fetchQR();
        
        // Start polling for status every 5 seconds
        pollIntervalRef.current = setInterval(async () => {
          const connected = await checkInstanceStatus();
          if (connected) {
            clearIntervals();
          }
        }, 5000);
        
        // Refresh QR every 30 seconds
        qrRefreshIntervalRef.current = setInterval(fetchQR, 30000);
      } else {
        setStatus('no_instance');
      }
    }
  }, [checkInstanceStatus, fetchQR, child.id, clearIntervals]);

  useEffect(() => {
    initializeConnection();
    
    return () => {
      clearIntervals();
    };
  }, [initializeConnection, clearIntervals]);

  const createInstance = async (e?: React.MouseEvent) => {
    // Prevent any form submission or navigation
    e?.preventDefault();
    e?.stopPropagation();
    
    setStatus('creating');
    setErrorMessage(null);
    setCreationProgress(0);
    
    // Start progress animation (90 seconds total)
    const startTime = Date.now();
    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min((elapsed / CREATION_DURATION_MS) * 100, 95); // Cap at 95% until done
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
        setStatus('connected');
        toast.success('WhatsApp כבר מחובר!');
        return;
      }

      // Wait for progress to reach completion visually
      const remainingTime = Math.max(0, CREATION_DURATION_MS - (Date.now() - startTime));
      if (remainingTime > 0) {
        await new Promise(resolve => setTimeout(resolve, remainingTime));
      }
      
      clearInterval(progressInterval);
      creationTimerRef.current = null;
      setCreationProgress(100);
      
      toast.success('מופע נוצר בהצלחה! מחכה לסריקת QR...');
      
      // Wait a moment for instance to be ready, then fetch QR
      await new Promise(resolve => setTimeout(resolve, 2000));
      await initializeConnection();
      
    } catch (error: any) {
      clearInterval(progressInterval);
      creationTimerRef.current = null;
      console.error('Create instance error:', error);
      setErrorMessage(error.message || 'שגיאה ביצירת מופע');
      setStatus('error');
      toast.error('שגיאה ביצירת חיבור: ' + error.message);
    }
  };

  const deleteInstance = async () => {
    setIsDeleting(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('green-api-partner', {
        body: { action: 'deleteInstance', child_id: child.id },
      });

      if (error) throw error;

      clearIntervals();
      setStatus('no_instance');
      setQrCode(null);
      toast.success('החיבור נותק בהצלחה');
      onUpdate();
      
    } catch (error: any) {
      console.error('Delete instance error:', error);
      toast.error('שגיאה בניתוק: ' + error.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const syncMessages = useCallback(async (showToast = true) => {
    setSyncing(true);

    try {
      const { data, error } = await supabase.functions.invoke('green-api-fetch', {
        body: { child_id: child.id },
      });

      if (error) throw error;

      if (data.error) {
        throw new Error(data.error);
      }

      if (showToast && data.messagesImported > 0) {
        toast.success(`נטענו ${data.messagesImported} הודעות מ-${data.chatsProcessed} שיחות`);
      }
      onUpdate();
    } catch (error: any) {
      if (showToast) {
        toast.error('שגיאה בסנכרון: ' + error.message);
      }
      console.error('Sync error:', error);
    } finally {
      setSyncing(false);
    }
  }, [child.id, onUpdate]);

  // Auto-sync when connected
  useEffect(() => {
    if (status === 'connected') {
      // Sync immediately on connect
      syncMessages(false);
      
      // Then sync every 60 seconds
      autoSyncIntervalRef.current = setInterval(() => {
        syncMessages(false);
      }, 60000);
      
      return () => {
        if (autoSyncIntervalRef.current) {
          clearInterval(autoSyncIntervalRef.current);
          autoSyncIntervalRef.current = null;
        }
      };
    }
  }, [status, syncMessages]);

  return (
    <div className="space-y-6">
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Smartphone className="w-5 h-5 text-primary" />
            חיבור WhatsApp
          </CardTitle>
          <CardDescription>
            {status === 'no_instance' 
              ? 'צרו חיבור WhatsApp חדש למעקב אחר ההודעות'
              : 'סרקו את הקוד עם WhatsApp לחיבור המכשיר'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Status Badge */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">סטטוס חיבור:</span>
            {status === 'loading' && (
              <Badge variant="secondary" className="gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                בודק...
              </Badge>
            )}
            {status === 'no_instance' && (
              <Badge variant="secondary" className="gap-1">
                <WifiOff className="w-3 h-3" />
                לא מוגדר
              </Badge>
            )}
            {status === 'creating' && (
              <Badge variant="secondary" className="gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                יוצר חיבור...
              </Badge>
            )}
            {status === 'connected' && (
              <Badge variant="success" className="gap-1">
                <Wifi className="w-3 h-3" />
                מחובר
              </Badge>
            )}
            {status === 'waiting_scan' && (
              <Badge variant="outline" className="gap-1 border-primary/50 text-primary">
                <QrCode className="w-3 h-3" />
                ממתין לסריקה
              </Badge>
            )}
            {status === 'error' && (
              <Badge variant="destructive" className="gap-1">
                שגיאה
              </Badge>
            )}
          </div>

          {/* No Instance State - Create Button */}
          {status === 'no_instance' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
                <Smartphone className="w-10 h-10 text-muted-foreground" />
              </div>
              <div className="text-center space-y-2">
                <h3 className="font-medium text-foreground">אין חיבור WhatsApp</h3>
                <p className="text-sm text-muted-foreground">
                  צרו חיבור חדש כדי להתחיל לקבל הודעות
                </p>
              </div>
              <Button onClick={(e) => createInstance(e)} variant="glow" className="gap-2" type="button">
                <Plus className="w-4 h-4" />
                צור חיבור WhatsApp
              </Button>
            </div>
          )}

          {/* Creating State - Progress Animation */}
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

          {/* QR Code Display */}
          {status === 'waiting_scan' && qrCode && (
            <div className="flex flex-col items-center gap-4 py-6">
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
                  הקוד מתרענן אוטומטית כל 30 שניות
                </p>
              </div>
            </div>
          )}

          {/* Loading State */}
          {status === 'loading' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="w-12 h-12 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">בודק סטטוס חיבור...</p>
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
                  ההודעות יתקבלו אוטומטית
                </p>
              </div>
            </div>
          )}

          {/* Error State */}
          {status === 'error' && (
            <div className="text-center py-8 space-y-4">
              <p className="text-sm text-destructive">{errorMessage}</p>
              <Button onClick={initializeConnection} variant="outline">
                <RefreshCw className="w-4 h-4 ml-2" />
                נסה שוב
              </Button>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2 pt-4 border-t border-border">
            {status !== 'loading' && status !== 'creating' && status !== 'no_instance' && (
              <Button onClick={initializeConnection} variant="outline" size="sm">
                <RefreshCw className="w-4 h-4 ml-2" />
                רענן
              </Button>
            )}
            {status === 'connected' && (
              <>
                <Button onClick={() => syncMessages(true)} variant="glow" size="sm" disabled={syncing}>
                  {syncing ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : null}
                  סנכרן עכשיו
                </Button>
                <Button 
                  onClick={deleteInstance} 
                  variant="destructive" 
                  size="sm" 
                  disabled={isDeleting}
                  className="gap-1"
                >
                  {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unplug className="w-4 h-4" />}
                  נתק
                </Button>
              </>
            )}
            {status === 'waiting_scan' && (
              <Button 
                onClick={deleteInstance} 
                variant="destructive" 
                size="sm" 
                disabled={isDeleting}
                className="gap-1"
              >
                {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unplug className="w-4 h-4" />}
                בטל
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
