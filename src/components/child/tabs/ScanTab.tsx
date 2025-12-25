import { useState } from 'react';
import { Scan as ScanIcon, Clock, Loader2, CheckCircle, AlertTriangle, Zap, Eye, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Child, LookbackWindow } from '@/types/database';
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

const lookbackHours: Record<LookbackWindow, number> = {
  '24h': 24,
  '7d': 24 * 7,
  '30d': 24 * 30,
};

export function ScanTab({ child, onScanComplete }: ScanTabProps) {
  const [lookback, setLookback] = useState<LookbackWindow>('7d');
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [promptPreview, setPromptPreview] = useState<{
    userPrompt: string;
    messagesCount: number;
    limitedCount: number;
    newestMessageAt: string | null;
    oldestMessageAt: string | null;
  } | null>(null);
  const [result, setResult] = useState<{
    threatDetected: boolean;
    riskLevel: string | null;
    findingsCount: number;
    patternsCount: number;
  } | null>(null);

  // Build the prompt (same logic as edge function)
  const buildPrompt = (messages: any[], lookbackWindow: LookbackWindow) => {
    const limitedMessages = messages.slice(-50);

    const formattedMessages = limitedMessages.map((msg) => {
      let content = msg.text_content;
      if (!content) {
        if (msg.media_url) {
          content = `[מדיה: ${msg.msg_type}] URL: ${msg.media_url}`;
        } else {
          content = `[מדיה: ${msg.msg_type}] (ללא URL)`;
        }
      }
      return {
        id: msg.id,
        sender: msg.sender_label,
        isChild: msg.is_child_sender,
        type: msg.msg_type,
        time: msg.message_timestamp,
        content: content.slice(0, 500),
        media_url: msg.media_url || null,
        chat: msg.chat_name || "שיחה",
      };
    });

    const lookbackLabel =
      lookbackWindow === '24h'
        ? '24 שעות אחרונות'
        : lookbackWindow === '7d'
          ? '7 ימים אחרונים'
          : '30 ימים אחרונים';

    const userPrompt = אתה מערכת AI לזיהוי סיכונים חמורים לילדים מתוך שיחות.

המטרה שלך:
לאתר **אך ורק** מצבים מסוכנים באמת, שעלולים לגרום לפגיעה ממשית בילד/ה.

❗ חשוב מאוד:
אל תסמן איום אם אין סיכון ברור, חד-משמעי ומגובה בהקשר.
עדיף לפספס מקרה גבולי מאשר להתריע על שטויות.

סוגי סיכון שמותר לזהות:
- חרם, השפלה מתמשכת או אלימות רגשית קשה
- איומים פיזיים מפורשים
- אלימות מינית, הטרדה מינית או פנייה מינית לקטין
- סמים, אלכוהול או שידול לשימוש
- פגיעה עצמית או עידוד לפגיעה עצמית
- סחיטה, איום או מניפולציה מסוכנת

❌ אסור להתריע על:
- שיח יומיומי, בדיחות, קללות קלות
- פוליטיקה, חדשות, דעות
- ויכוחים רגילים
- שפה בוטה בלי איום ממשי
- תוכן לא נעים אך לא מסוכן

טווח ניתוח:
${lookbackLabel}

הודעות לניתוח:
${JSON.stringify(formattedMessages, null, 2)}

---

📤 החזר **JSON בלבד**, בלי טקסט חופשי, בלי הסברים מסביב.

מבנה החזרה מחייב:
{
  "threatDetected": boolean,
  "riskLevel": "low" | "medium" | "high" | "critical" | null,
  "threatTypes": string[],
  "triggers": [
    {
      "messageId": string,
      "type": "text" | "image" | "audio",
      "preview": string,
      "confidence": number
    }
  ],
  "patterns": [
    {
      "chatId": string,
      "patternType": string,
      "description": string,
      "confidence": number
    }
  ],
  "explanation": string
}

אם אין סיכון ממשי → החזר:
{
  "threatDetected": false,
  "riskLevel": null,
  "threatTypes": [],
  "triggers": [],
  "patterns": [],
  "explanation": "לא זוהה סיכון ממשי"
}
    const oldestMessageAt = limitedMessages[0]?.message_timestamp ?? null;
    const newestMessageAt = limitedMessages[limitedMessages.length - 1]?.message_timestamp ?? null;

    return {
      userPrompt,
      messagesCount: messages.length,
      limitedCount: limitedMessages.length,
      newestMessageAt,
      oldestMessageAt,
    };
  };

  const previewPrompt = async () => {
    try {
      // Calculate lookback date
      const lookbackDate = new Date();
      lookbackDate.setHours(lookbackDate.getHours() - lookbackHours[lookback]);

      // Fetch messages for analysis
      const { data: messages, error: messagesError } = await supabase
        .from('messages')
        .select(`
          id,
          sender_label,
          is_child_sender,
          msg_type,
          message_timestamp,
          text_content,
          media_url,
          chat_id,
          chats!inner(chat_name)
        `)
        .eq('child_id', child.id)
        .gte('message_timestamp', lookbackDate.toISOString())
        .order('message_timestamp', { ascending: true });

      if (messagesError) throw messagesError;

      // Format messages with chat names
      const formattedMessages = (messages || []).map((msg: any) => ({
        id: msg.id,
        sender_label: msg.sender_label,
        is_child_sender: msg.is_child_sender,
        msg_type: msg.msg_type,
        message_timestamp: msg.message_timestamp,
        text_content: msg.text_content,
        media_url: msg.media_url,
        chat_name: msg.chats?.chat_name,
      }));

      const prompt = buildPrompt(formattedMessages, lookback);
      setPromptPreview(prompt);
    } catch (error: any) {
      console.error('Error building preview:', error);
      toast.error('שגיאה בטעינת הפרומפט: ' + error.message);
    }
  };

  const startScan = async () => {
    setScanning(true);
    setProgress(0);
    setResult(null);
    setPromptPreview(null);

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

      setProgress(10);

      // Calculate lookback date
      const lookbackDate = new Date();
      lookbackDate.setHours(lookbackDate.getHours() - lookbackHours[lookback]);

      // Fetch messages for analysis
      const { data: messages, error: messagesError } = await supabase
        .from('messages')
        .select(`
          id,
          sender_label,
          is_child_sender,
          msg_type,
          message_timestamp,
          text_content,
          media_url,
          chat_id,
          chats!inner(chat_name)
        `)
        .eq('child_id', child.id)
        .gte('message_timestamp', lookbackDate.toISOString())
        .order('message_timestamp', { ascending: true });

      if (messagesError) throw messagesError;

      setProgress(30);

      // Format messages with chat names
      const formattedMessages = (messages || []).map((msg: any) => ({
        id: msg.id,
        sender_label: msg.sender_label,
        is_child_sender: msg.is_child_sender,
        msg_type: msg.msg_type,
        message_timestamp: msg.message_timestamp,
        text_content: msg.text_content,
        media_url: msg.media_url,
        chat_name: msg.chats?.chat_name,
      }));

      console.log(`Sending ${formattedMessages.length} messages for AI analysis`);

      setProgress(40);

      // Call AI analysis edge function
      const { data: analysisData, error: analysisError } = await supabase.functions.invoke(
        'analyze-threats',
        {
          body: {
            child_id: child.id,
            scan_id: scan.id,
            messages: formattedMessages,
            lookback_window: lookback,
          },
        }
      );

      if (analysisError) {
        console.error('AI analysis error:', analysisError);
        throw new Error(analysisError.message || 'שגיאה בניתוח AI');
      }

      setProgress(80);

      const aiResult = analysisData;
      console.log('AI analysis result:', aiResult);

      // Handle rate limiting or payment errors
      if (aiResult.error) {
        throw new Error(aiResult.error);
      }

      // Create finding if threats detected
      if (aiResult.threatDetected && scan) {
        const { error: findingError } = await supabase.from('findings').insert({
          scan_id: scan.id,
          child_id: child.id,
          threat_detected: true,
          risk_level: aiResult.riskLevel,
          threat_types: aiResult.threatTypes || [],
          explanation: aiResult.explanation,
        });

        if (findingError) {
          console.error('Error saving finding:', findingError);
        }

        // Create patterns
        for (const pattern of aiResult.patterns || []) {
          // Find the chat by name
          const { data: chatData } = await supabase
            .from('chats')
            .select('id')
            .eq('child_id', child.id)
            .limit(1)
            .maybeSingle();

          if (chatData) {
            await supabase.from('patterns').insert({
              scan_id: scan.id,
              chat_id: chatData.id,
              pattern_type: pattern.patternType,
              description: pattern.description,
              confidence: pattern.confidence,
            });
          }
        }
      }

      setProgress(90);

      // Update scan with results
      const summaryJson = {
        threat_detected: aiResult.threatDetected,
        risk_level: aiResult.riskLevel,
        threat_count: aiResult.threatDetected ? 1 : 0,
        patterns_count: aiResult.patterns?.length || 0,
      };

      await supabase
        .from('scans')
        .update({
          status: 'completed',
          finished_at: new Date().toISOString(),
          duration_seconds: Math.floor((Date.now() - new Date(scan.started_at!).getTime()) / 1000),
          messages_analyzed: formattedMessages.length,
          summary_json: summaryJson,
        })
        .eq('id', scan.id);

      setProgress(100);
      setResult({
        threatDetected: aiResult.threatDetected,
        riskLevel: aiResult.riskLevel,
        findingsCount: aiResult.threatDetected ? 1 : 0,
        patternsCount: aiResult.patterns?.length || 0,
      });

      if (aiResult.threatDetected) {
        toast.warning('זוהו סיכונים פוטנציאליים!');
      } else {
        toast.success('לא זוהו סיכונים');
      }

      onScanComplete();
    } catch (error: any) {
      console.error('Scan error:', error);
      toast.error('שגיאה בסריקה: ' + error.message);
      setScanning(false);
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
            סריקת בטיחות AI
          </CardTitle>
          <CardDescription>
            הפעילו סריקה מבוססת בינה מלאכותית לזיהוי סיכונים בשיחות
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!scanning && !result && !promptPreview && (
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

              <div className="glass-card p-4 rounded-xl">
                <p className="text-sm text-muted-foreground">
                  <strong className="text-foreground">ניתוח AI:</strong> הסריקה משתמשת ב-Gemini AI לזיהוי דפוסים מסוכנים כמו הטרדות, לחצים, ובקשות לא הולמות.
                </p>
              </div>

              <div className="flex gap-3">
                <Button onClick={previewPrompt} variant="outline" size="lg" className="flex-1">
                  <Eye className="w-5 h-5" />
                  הצג פרומפט לבדיקה
                </Button>
                <Button onClick={startScan} variant="glow" size="lg" className="flex-1">
                  <Zap className="w-5 h-5" />
                  התחל סריקה
                </Button>
              </div>
            </>
          )}

          {promptPreview && !scanning && !result && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-heebo font-bold text-lg">תצוגה מקדימה של הפרומפט</h3>
                <Button variant="ghost" size="sm" onClick={() => setPromptPreview(null)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
              
              <div className="glass-card p-4 rounded-xl space-y-2">
                <p className="text-sm">
                  <strong>סה"כ הודעות:</strong> {promptPreview.messagesCount}
                </p>
                <p className="text-sm">
                  <strong>נשלחות לניתוח:</strong> {promptPreview.limitedCount} (מוגבל ל-50 אחרונות)
                </p>
                <p className="text-sm">
                  <strong>טווח זמן בפריוויו:</strong>{' '}
                  {promptPreview.oldestMessageAt
                    ? new Date(promptPreview.oldestMessageAt).toLocaleString('he-IL')
                    : '—'}{' '}
                  →{' '}
                  {promptPreview.newestMessageAt
                    ? new Date(promptPreview.newestMessageAt).toLocaleString('he-IL')
                    : '—'}
                </p>
              </div>

              <div className="space-y-2">
                <Label className="font-bold">User Prompt (נשלח ל-Assistant):</Label>
                <ScrollArea className="h-[400px] border rounded-lg p-4 bg-muted/50" dir="ltr">
                  <pre className="text-xs whitespace-pre-wrap font-mono text-left">
                    {promptPreview.userPrompt}
                  </pre>
                </ScrollArea>
              </div>

              <p className="text-sm text-muted-foreground">
                <strong>System Prompt:</strong> מוגדר ב-OpenAI Assistant עם ID: <code className="bg-muted px-1 rounded">asst_epnwyX2RqHBRjbDdN4YQIYPs</code>
              </p>

              <div className="flex gap-3">
                <Button onClick={() => setPromptPreview(null)} variant="outline" size="lg" className="flex-1">
                  חזרה
                </Button>
                <Button onClick={startScan} variant="glow" size="lg" className="flex-1">
                  <Zap className="w-5 h-5" />
                  התחל סריקה
                </Button>
              </div>
            </div>
          )}

          {scanning && (
            <div className="text-center py-12">
              <Loader2 className="w-16 h-16 mx-auto mb-4 text-primary animate-spin" />
              <h3 className="font-heebo font-bold text-lg mb-4">מנתח שיחות עם AI...</h3>
              <Progress value={progress} className="max-w-xs mx-auto" />
              <p className="text-sm text-muted-foreground mt-2">
                {progress < 30 && 'אוסף הודעות...'}
                {progress >= 30 && progress < 80 && 'מנתח תוכן עם בינה מלאכותית...'}
                {progress >= 80 && 'שומר תוצאות...'}
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
