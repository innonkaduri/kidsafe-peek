import { useState } from 'react';
import { Scan as ScanIcon, Clock, Loader2, CheckCircle, AlertTriangle, Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Child, LookbackWindow, RiskLevel } from '@/types/database';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ScanTabProps {
  child: Child;
  onScanComplete: () => void;
}

const lookbackLabels: Record<LookbackWindow, string> = {
  '24h': '24 שעות אחרונות',
  '7d': '7 ימים אחרונים',
  '30d': '30 ימים אחרונים',
};

export function ScanTab({ child, onScanComplete }: ScanTabProps) {
  const [lookback, setLookback] = useState<LookbackWindow>('7d');
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{
    threatDetected: boolean;
    riskLevel: RiskLevel | null;
    findingsCount: number;
    patternsCount: number;
  } | null>(null);

  const startScan = async () => {
    setScanning(true);
    setProgress(0);
    setResult(null);

    try {
      // Create scan record
      const { data: scan, error: scanError } = await supabase
        .from('scans')
        .insert({
          child_id: child.id,
          lookback_window: lookback,
          status: 'running',
          started_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (scanError) throw scanError;

      // Simulate AI analysis progress
      for (let i = 0; i <= 90; i += 10) {
        await new Promise(resolve => setTimeout(resolve, 300));
        setProgress(i);
      }

      // Get messages count
      const { count: messagesCount } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('child_id', child.id);

      // Generate mock AI analysis result
      const mockResult = generateMockAnalysisResult();

      // Create finding if threats detected
      if (mockResult.threatDetected && scan) {
        await supabase.from('findings').insert({
          scan_id: scan.id,
          child_id: child.id,
          threat_detected: true,
          risk_level: mockResult.riskLevel,
          threat_types: mockResult.threatTypes,
          explanation: mockResult.explanation,
        });

        // Create patterns
        for (const pattern of mockResult.patterns) {
          // Get a random chat
          const { data: chat } = await supabase
            .from('chats')
            .select('id')
            .eq('child_id', child.id)
            .limit(1)
            .maybeSingle();

          if (chat) {
            await supabase.from('patterns').insert({
              scan_id: scan.id,
              chat_id: chat.id,
              pattern_type: pattern.type,
              description: pattern.description,
              confidence: pattern.confidence,
            });
          }
        }
      }

      // Update scan with results
      const summaryJson = {
        threat_detected: mockResult.threatDetected,
        risk_level: mockResult.riskLevel,
        threat_count: mockResult.threatDetected ? 1 : 0,
        patterns_count: mockResult.patterns.length,
      };

      await supabase
        .from('scans')
        .update({
          status: 'completed',
          finished_at: new Date().toISOString(),
          duration_seconds: Math.floor(Math.random() * 30) + 10,
          messages_analyzed: messagesCount || 0,
          summary_json: summaryJson,
        })
        .eq('id', scan.id);

      setProgress(100);
      setResult({
        threatDetected: mockResult.threatDetected,
        riskLevel: mockResult.riskLevel,
        findingsCount: mockResult.threatDetected ? 1 : 0,
        patternsCount: mockResult.patterns.length,
      });

      if (mockResult.threatDetected) {
        toast.warning('זוהו סיכונים פוטנציאליים!');
      } else {
        toast.success('לא זוהו סיכונים');
      }

      onScanComplete();
    } catch (error: any) {
      console.error('Scan error:', error);
      toast.error('שגיאה בסריקה: ' + error.message);
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScanIcon className="w-5 h-5 text-primary" />
            סריקת בטיחות
          </CardTitle>
          <CardDescription>
            הפעילו סריקה לזיהוי סיכונים פוטנציאליים בשיחות
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!scanning && !result && (
            <>
              <div className="space-y-4">
                <Label className="text-base font-heebo">בחרו טווח זמן לסריקה:</Label>
                <RadioGroup
                  value={lookback}
                  onValueChange={(v) => setLookback(v as LookbackWindow)}
                  className="grid grid-cols-3 gap-4"
                >
                  {(['24h', '7d', '30d'] as LookbackWindow[]).map((window) => (
                    <div key={window}>
                      <RadioGroupItem
                        value={window}
                        id={window}
                        className="peer sr-only"
                      />
                      <Label
                        htmlFor={window}
                        className="flex flex-col items-center justify-center rounded-xl border-2 border-border bg-secondary/50 p-4 hover:bg-secondary cursor-pointer peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/10 transition-all"
                      >
                        <Clock className="w-6 h-6 mb-2" />
                        <span className="font-medium">{lookbackLabels[window]}</span>
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              <Button onClick={startScan} variant="glow" size="lg" className="w-full">
                <Zap className="w-5 h-5" />
                התחל סריקה
              </Button>
            </>
          )}

          {scanning && (
            <div className="text-center py-12">
              <Loader2 className="w-16 h-16 mx-auto mb-4 text-primary animate-spin" />
              <h3 className="font-heebo font-bold text-lg mb-4">מנתח שיחות...</h3>
              <Progress value={progress} className="max-w-xs mx-auto" />
              <p className="text-sm text-muted-foreground mt-2">
                בודק תוכן חשוד, דפוסים מסוכנים ושיחות עם זרים
              </p>
            </div>
          )}

          {result && (
            <div className="text-center py-8">
              {result.threatDetected ? (
                <>
                  <AlertTriangle className="w-16 h-16 mx-auto mb-4 text-warning" />
                  <h3 className="font-heebo font-bold text-xl mb-2">זוהו סיכונים!</h3>
                  <Badge 
                    variant={
                      result.riskLevel === 'critical' ? 'riskCritical' :
                      result.riskLevel === 'high' ? 'riskHigh' :
                      result.riskLevel === 'medium' ? 'riskMedium' : 'riskLow'
                    }
                    className="mb-4"
                  >
                    רמת סיכון: {result.riskLevel === 'critical' ? 'קריטי' : result.riskLevel === 'high' ? 'גבוה' : result.riskLevel === 'medium' ? 'בינוני' : 'נמוך'}
                  </Badge>
                  <div className="grid grid-cols-2 gap-4 max-w-sm mx-auto mb-6">
                    <div className="glass-card p-4 rounded-xl">
                      <span className="text-2xl font-bold text-warning">{result.findingsCount}</span>
                      <p className="text-sm text-muted-foreground">ממצאים</p>
                    </div>
                    <div className="glass-card p-4 rounded-xl">
                      <span className="text-2xl font-bold text-primary">{result.patternsCount}</span>
                      <p className="text-sm text-muted-foreground">דפוסים</p>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <CheckCircle className="w-16 h-16 mx-auto mb-4 text-success" />
                  <h3 className="font-heebo font-bold text-xl mb-2">לא זוהו סיכונים</h3>
                  <p className="text-muted-foreground mb-4">
                    השיחות שנבדקו נראות בטוחות
                  </p>
                </>
              )}
              <Button onClick={() => setResult(null)} variant="outline">
                סריקה חדשה
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function generateMockAnalysisResult() {
  const hasThreats = Math.random() > 0.3; // 70% chance of finding something

  if (!hasThreats) {
    return {
      threatDetected: false,
      riskLevel: null as RiskLevel | null,
      threatTypes: [],
      explanation: '',
      patterns: [],
    };
  }

  const riskLevels: RiskLevel[] = ['low', 'medium', 'high', 'critical'];
  const riskLevel = riskLevels[Math.floor(Math.random() * riskLevels.length)];

  return {
    threatDetected: true,
    riskLevel,
    threatTypes: ['adult_inappropriate', 'coercion_pressure'],
    explanation: 'זוהתה שיחה עם אדם לא מוכר שביקש תמונות אישיות. הודעות מכילות ניסיון ללחוץ על הילד/ה לשתף מידע אישי.',
    patterns: [
      {
        type: 'persistent_contact',
        description: 'ניסיונות חוזרים ליצירת קשר מצד אותו משתמש',
        confidence: 0.85,
      },
      {
        type: 'secrecy_request',
        description: 'בקשות לשמור על סודיות מהורים',
        confidence: 0.72,
      },
    ],
  };
}
