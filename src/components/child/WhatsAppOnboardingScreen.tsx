import { Smartphone, Shield, Plus, RefreshCw, QrCode, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Child } from '@/types/database';
import { useWhatsAppConnection } from '@/hooks/useWhatsAppConnection';
import { QR_LOADING_STAGES, getCreationProgressMessage } from '@/constants/whatsapp';
import { useEffect } from 'react';

interface WhatsAppOnboardingScreenProps {
  child: Child;
  onConnected: () => void;
}

export function WhatsAppOnboardingScreen({ child, onConnected }: WhatsAppOnboardingScreenProps) {
  const {
    status,
    qrCode,
    errorMessage,
    creationProgress,
    qrLoadingProgress,
    qrLoadingStage,
    createInstance,
    fetchQR,
    clearIntervals,
  } = useWhatsAppConnection({
    childId: child.id,
    onConnected: () => setTimeout(onConnected, 1500),
    autoInitialize: true,
  });

  useEffect(() => {
    return () => clearIntervals();
  }, [clearIntervals]);

  const currentLoadingStage = QR_LOADING_STAGES[qrLoadingStage];
  const LoadingIcon = currentLoadingStage?.icon;

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
              <div className="relative">
                <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
                  <Smartphone className="w-8 h-8 text-primary animate-pulse" />
                </div>
              </div>
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
              <Button onClick={() => createInstance()} variant="glow" size="lg" className="gap-2" type="button">
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
                <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-background border-2 border-primary flex items-center justify-center">
                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              </div>
              <div className="text-center space-y-2">
                <h3 className="font-medium text-foreground">יוצר חיבור מאובטח</h3>
                <p className="text-sm text-muted-foreground">
                  {getCreationProgressMessage(creationProgress)}
                </p>
              </div>
              <div className="w-full max-w-xs space-y-2">
                <Progress value={creationProgress} className="h-2" />
                <p className="text-xs text-muted-foreground/60 text-center">
                  {Math.round(creationProgress)}%
                </p>
              </div>
            </div>
          )}

          {/* Error State */}
          {status === 'error' && (
            <div className="flex flex-col items-center gap-6 py-8">
              <div className="text-center space-y-3">
                <p className="text-destructive">{errorMessage || 'שגיאה בחיבור'}</p>
              </div>
              <Button onClick={() => createInstance()} variant="outline" className="gap-2">
                <RefreshCw className="w-4 h-4" />
                נסה שוב
              </Button>
            </div>
          )}

          {/* QR Code Display or Waiting for QR */}
          {status === 'waiting_scan' && (
            <div className="flex flex-col items-center gap-4 py-6">
              <Badge variant="outline" className="gap-1 border-primary/50 text-primary mb-2">
                <QrCode className="w-3 h-3" />
                {qrCode ? 'ממתין לסריקה' : 'מכין קוד...'}
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
                    <p className="text-xs text-muted-foreground/60">הקוד מתרענן אוטומטית</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={fetchQR} className="gap-2">
                    <RefreshCw className="w-4 h-4" />
                    רענן QR
                  </Button>
                </>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <div className="w-64 h-64 bg-muted/30 rounded-2xl flex flex-col items-center justify-center gap-4 border border-border/50">
                    <div className="relative">
                      <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
                        {LoadingIcon && <LoadingIcon className="w-8 h-8 text-primary" />}
                      </div>
                      <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-background border-2 border-primary flex items-center justify-center">
                        <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      </div>
                    </div>
                    <div className="text-center px-4">
                      <p className="text-sm font-medium text-foreground">
                        {currentLoadingStage?.text || 'מתחבר...'}
                      </p>
                    </div>
                    <div className="w-40">
                      <Progress value={qrLoadingProgress} className="h-1.5" />
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">ה-QR יופיע בקרוב...</p>
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
                <p className="text-sm text-muted-foreground">מעביר לפרופיל הילד...</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
