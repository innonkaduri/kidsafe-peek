import { useState, useEffect, useRef, useCallback } from 'react';
import { Smartphone, Loader2, CheckCircle, RefreshCw, QrCode, Wifi, WifiOff } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Child } from '@/types/database';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ConnectorTabProps {
  child: Child;
  onUpdate: () => void;
}

type ConnectionStatus = 'loading' | 'disconnected' | 'waiting_scan' | 'connected' | 'error';

export function ConnectorTab({ child, onUpdate }: ConnectorTabProps) {
  const [status, setStatus] = useState<ConnectionStatus>('loading');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const qrRefreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const checkStatus = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('green-api-qr', {
        body: { action: 'status' },
      });

      if (error) throw error;

      if (data.authorized) {
        setStatus('connected');
        setQrCode(null);
        // Stop polling when connected
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        if (qrRefreshIntervalRef.current) {
          clearInterval(qrRefreshIntervalRef.current);
          qrRefreshIntervalRef.current = null;
        }
        return true;
      }
      return false;
    } catch (error) {
      console.error('Status check error:', error);
      return false;
    }
  }, []);

  const fetchQR = useCallback(async () => {
    try {
      setErrorMessage(null);
      
      const { data, error } = await supabase.functions.invoke('green-api-qr', {
        body: { action: 'qr' },
      });

      if (error) throw error;

      if (data.type === 'qrCode' && data.message) {
        setQrCode(data.message);
        setStatus('waiting_scan');
      } else if (data.type === 'alreadyLogged') {
        setStatus('connected');
        setQrCode(null);
      } else if (data.type === 'error') {
        setErrorMessage(data.message || 'שגיאה בקבלת QR');
        setStatus('error');
      }
    } catch (error: any) {
      console.error('QR fetch error:', error);
      setErrorMessage(error.message || 'שגיאה בחיבור');
      setStatus('error');
    }
  }, []);

  const initializeConnection = useCallback(async () => {
    setStatus('loading');
    
    // First check if already connected
    const isConnected = await checkStatus();
    
    if (!isConnected) {
      // Fetch QR code
      await fetchQR();
      
      // Start polling for status every 5 seconds
      pollIntervalRef.current = setInterval(checkStatus, 5000);
      
      // Refresh QR every 20 seconds (QR codes expire)
      qrRefreshIntervalRef.current = setInterval(fetchQR, 20000);
    }
  }, [checkStatus, fetchQR]);

  useEffect(() => {
    initializeConnection();
    
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (qrRefreshIntervalRef.current) clearInterval(qrRefreshIntervalRef.current);
    };
  }, [initializeConnection]);

  const handleRefresh = () => {
    initializeConnection();
  };

  const syncMessages = async () => {
    setSyncing(true);

    try {
      const { data, error } = await supabase.functions.invoke('green-api-fetch', {
        body: { child_id: child.id },
      });

      if (error) throw error;

      if (data.error) {
        throw new Error(data.error);
      }

      toast.success(`נטענו ${data.messagesImported} הודעות מ-${data.chatsProcessed} שיחות`);
      onUpdate();
    } catch (error: any) {
      toast.error('שגיאה בסנכרון: ' + error.message);
    } finally {
      setSyncing(false);
    }
  };

  // Ensure data source exists for this child
  useEffect(() => {
    const ensureDataSource = async () => {
      const { data: existing } = await supabase
        .from('data_sources')
        .select('id')
        .eq('child_id', child.id)
        .eq('source_type', 'connector')
        .maybeSingle();

      if (!existing) {
        await supabase.from('data_sources').insert({
          child_id: child.id,
          source_type: 'connector',
          status: 'active',
        });
      }
    };
    ensureDataSource();
  }, [child.id]);

  const webhookUrl = `https://qhsvmfnjoowexmyaqgrr.supabase.co/functions/v1/green-api-webhook`;

  return (
    <div className="space-y-6">
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Smartphone className="w-5 h-5 text-primary" />
            חיבור WhatsApp
          </CardTitle>
          <CardDescription>
            סרקו את הקוד עם WhatsApp לחיבור המכשיר
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
            {status === 'disconnected' && (
              <Badge variant="secondary" className="gap-1">
                <WifiOff className="w-3 h-3" />
                לא מחובר
              </Badge>
            )}
            {status === 'error' && (
              <Badge variant="destructive" className="gap-1">
                שגיאה
              </Badge>
            )}
          </div>

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
                  הקוד מתרענן אוטומטית כל 20 שניות
                </p>
              </div>
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

          {/* Loading State */}
          {status === 'loading' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="w-12 h-12 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">מתחבר...</p>
            </div>
          )}

          {/* Error State */}
          {status === 'error' && (
            <div className="text-center py-8 space-y-4">
              <p className="text-sm text-destructive">{errorMessage}</p>
              <Button onClick={handleRefresh} variant="outline">
                <RefreshCw className="w-4 h-4 ml-2" />
                נסה שוב
              </Button>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2 pt-4 border-t border-border">
            {status !== 'loading' && (
              <Button onClick={handleRefresh} variant="outline" size="sm">
                <RefreshCw className="w-4 h-4 ml-2" />
                רענן
              </Button>
            )}
            {status === 'connected' && (
              <Button onClick={syncMessages} variant="glow" size="sm" disabled={syncing}>
                {syncing ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : null}
                סנכרן הודעות קיימות
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Webhook Info - Only show when connected */}
      {status === 'connected' && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-sm text-foreground">הגדרות Webhook</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              הגדירו את הכתובת הזו ב-Green API Console לקבלת הודעות בזמן אמת:
            </p>
            <code className="block p-3 bg-muted rounded-lg text-xs break-all text-foreground" dir="ltr">
              {webhookUrl}
            </code>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
