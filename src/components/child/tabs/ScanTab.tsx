import { useState, useEffect } from 'react';
import { Scan as ScanIcon, Loader2, CheckCircle, AlertTriangle, Zap, Eye, X, Sparkles, Calendar } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Child } from '@/types/database';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type ScanTimeRange = 'since_last_scan' | 'all' | 'last_week' | 'last_month';

interface ScanTabProps {
  child: Child;
  onScanComplete: () => void;
}

interface MessagePreview {
  messagesCount: number;
  textCount: number;
  imageCount: number;
  audioCount: number;
  videoCount: number;
  oldestMessageAt: string | null;
  newestMessageAt: string | null;
  exactPrompt: string;
  rawMessages: any[];
}

// New Gemini 3 response format
interface GeminiAlert {
  chatId: string;
  chatName: string;
  type: string;
  risk_score: number;
  confidence: number;
  summary: string;
  triggers: Array<{
    messageId: string;
    modality: 'text' | 'image' | 'audio' | 'video';
    preview: string;
    confidence: number;
  }>;
  childIsTarget: boolean;
  childIsAggressor: boolean;
}

interface LovableAIResult {
  success: boolean;
  model: string;
  provider: string;
  messages_analyzed: number;
  images_analyzed?: number;
  threatDetected: boolean;
  riskLevel: 'low' | 'medium' | 'high' | 'critical' | null;
  threatTypes: string[];
  alerts: GeminiAlert[];
  explanation: string;
}

export function ScanTab({ child, onScanComplete }: ScanTabProps) {
  const [scanning, setScanning] = useState(false);
  const [testingLovable, setTestingLovable] = useState(false);
  const [lovableResult, setLovableResult] = useState<LovableAIResult | null>(null);
  const [progress, setProgress] = useState(0);
  const [lastScanAt, setLastScanAt] = useState<string | null>(null);
  const [messagePreview, setMessagePreview] = useState<MessagePreview | null>(null);
  const [result, setResult] = useState<{
    threatDetected: boolean;
    riskLevel: string | null;
    findingsCount: number;
    alertsCount: number;
  } | null>(null);
  const [scanTimeRange, setScanTimeRange] = useState<ScanTimeRange>('since_last_scan');

  // Helper function to get date filter based on time range
  const getDateFilter = (): string | null => {
    const now = new Date();
    switch (scanTimeRange) {
      case 'since_last_scan':
        return lastScanAt;
      case 'last_week':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      case 'last_month':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      case 'all':
      default:
        return null;
    }
  };
  useEffect(() => {
    const fetchLastScan = async () => {
      const { data } = await supabase
        .from('scans')
        .select('finished_at')
        .eq('child_id', child.id)
        .eq('status', 'completed')
        .order('finished_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      setLastScanAt(data?.finished_at ?? null);
    };
    fetchLastScan();
  }, [child.id]);

  // Build the exact prompt that will be sent to AI (same format as analyze-threats)
  const buildExactPrompt = (msgs: any[]): string => {
    const textParts: string[] = [];

    for (const msg of msgs) {
      let messageText = "";

      if (msg.msg_type === "text") {
        messageText = `[${msg.message_timestamp}] ${msg.sender_label}${msg.is_child_sender ? " (הילד/ה)" : ""}: ${msg.text_content || ""}`;
      } else if (msg.msg_type === "audio" && msg.media_url) {
        messageText = `[${msg.message_timestamp}] ${msg.sender_label}${msg.is_child_sender ? " (הילד/ה)" : ""}: [הודעה קולית - תמלול יתבצע בזמן הסריקה]`;
        if (msg.text_content) {
          messageText += ` כיתוב: ${msg.text_content}`;
        }
      } else if (msg.msg_type === "image" && msg.media_url) {
        messageText = `[${msg.message_timestamp}] ${msg.sender_label}${msg.is_child_sender ? " (הילד/ה)" : ""}: [תמונה - תיבדק בזמן הסריקה]`;
        if (msg.text_content) {
          messageText += ` כיתוב: ${msg.text_content}`;
        }
      } else if (msg.msg_type === "video" && msg.media_url) {
        messageText = `[${msg.message_timestamp}] ${msg.sender_label}${msg.is_child_sender ? " (הילד/ה)" : ""}: [וידאו - תמלול ותיאור ויזואלי יתבצעו בזמן הסריקה]`;
        if (msg.text_content) {
          messageText += ` כיתוב: ${msg.text_content}`;
        }
      } else if (msg.msg_type !== "text") {
        const mediaLabel = msg.msg_type === "audio" ? "הודעה קולית" : msg.msg_type === "video" ? "וידאו" : "תמונה";
        messageText = `[${msg.message_timestamp}] ${msg.sender_label}${msg.is_child_sender ? " (הילד/ה)" : ""}: [${mediaLabel}]`;
        if (msg.text_content) {
          messageText += ` כיתוב: ${msg.text_content}`;
        }
      }

      if (messageText) {
        textParts.push(messageText);
      }
    }

    // Just show a summary of messages for preview
    return `=== תקציר הודעות לניתוח ===

סה"כ הודעות: ${msgs.length}

${textParts.slice(0, 20).join("\n")}
${msgs.length > 20 ? `\n... ועוד ${msgs.length - 20} הודעות` : ''}

=== הערה ===
הפרומפט המלא יישלח ל-Gemini 3 Pro עם ההוראות המפורטות לזיהוי סיכונים ממשיים בלבד.`;
  };

  // Fetch messages and build exact prompt preview
  const fetchMessagesPreview = async () => {
    try {
      let query = supabase
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
        .order('message_timestamp', { ascending: true });

      const dateFilter = getDateFilter();
      if (dateFilter) {
        query = query.gt('message_timestamp', dateFilter);
      }

      const { data: messages, error: messagesError } = await query;

      if (messagesError) throw messagesError;

      const allMessages = messages || [];
      
      // Count by type
      const textCount = allMessages.filter(m => m.msg_type === 'text').length;
      const imageCount = allMessages.filter(m => m.msg_type === 'image' && m.media_url).length;
      const audioCount = allMessages.filter(m => m.msg_type === 'audio' && m.media_url).length;
      const videoCount = allMessages.filter(m => m.msg_type === 'video' && m.media_url).length;

      // Build the exact prompt
      const exactPrompt = buildExactPrompt(allMessages);

      setMessagePreview({
        messagesCount: allMessages.length,
        textCount,
        imageCount,
        audioCount,
        videoCount,
        oldestMessageAt: allMessages[0]?.message_timestamp ?? null,
        newestMessageAt: allMessages[allMessages.length - 1]?.message_timestamp ?? null,
        exactPrompt,
        rawMessages: allMessages,
      });
    } catch (error: any) {
      console.error('Error fetching messages preview:', error);
      toast.error('שגיאה בטעינת ההודעות: ' + error.message);
    }
  };

  // Test with Lovable AI (Gemini)
  const testWithLovableAI = async () => {
    if (!messagePreview) return;

    setTestingLovable(true);
    setLovableResult(null);

    try {
      // Format messages for the edge function
      const formattedMessages = messagePreview.rawMessages.map((msg: any) => ({
        id: msg.id,
        sender_label: msg.sender_label,
        is_child_sender: msg.is_child_sender,
        msg_type: msg.msg_type,
        message_timestamp: msg.message_timestamp,
        text_content: msg.text_content,
        media_url: msg.media_url,
        chat_name: msg.chats?.chat_name,
      }));

      console.log('[ScanTab] Testing with Lovable AI, messages:', formattedMessages.length);

      const { data, error } = await supabase.functions.invoke('analyze-threats-lovable', {
        body: {
          child_id: child.id,
          messages: formattedMessages,
          child_context: `שם: ${child.display_name}, גיל: ${child.age_range || 'לא ידוע'}`,
        },
      });

      if (error) {
        console.error('[ScanTab] Lovable AI error:', error);
        throw error;
      }

      console.log('[ScanTab] Lovable AI result:', data);
      setLovableResult(data);
      toast.success('הבדיקה עם Lovable AI הושלמה');
    } catch (error: any) {
      console.error('[ScanTab] Lovable AI test failed:', error);
      toast.error('שגיאה בבדיקה עם Lovable AI: ' + error.message);
    } finally {
      setTestingLovable(false);
    }
  };

  const startScan = async () => {
    setScanning(true);
    setProgress(0);
    setResult(null);
    setMessagePreview(null);

    try {
      // Create scan record
      const { data: scan, error: scanError } = await supabase
        .from('scans')
        .insert({
          child_id: child.id,
          lookback_window: 'since_last_scan',
          status: 'running',
          started_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (scanError) throw scanError;

      setProgress(10);

      // Fetch messages since last scan (or all if no scan)
      let query = supabase
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
        .order('message_timestamp', { ascending: true });

      const dateFilter = getDateFilter();
      if (dateFilter) {
        query = query.gt('message_timestamp', dateFilter);
      }

      const { data: messages, error: messagesError } = await query;

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

      console.log(`[ScanTab] Sending ${formattedMessages.length} messages for AI analysis`);
      console.log(`[ScanTab] child_id: ${child.id}, scan_id: ${scan.id}`);

      setProgress(40);

      // Call Gemini 3 Pro analysis edge function
      console.log('[ScanTab] Invoking analyze-threats-lovable (Gemini 3 Pro)...');
      let analysisData: any;
      let analysisError: any;
      
      try {
        const result = await supabase.functions.invoke('analyze-threats-lovable', {
          body: {
            child_id: child.id,
            messages: formattedMessages,
            child_context: `שם: ${child.display_name}, גיל: ${child.age_range || 'לא ידוע'}`,
          },
        });
        analysisData = result.data;
        analysisError = result.error;
        console.log('[ScanTab] Gemini 3 Pro response received:', { hasData: !!analysisData, hasError: !!analysisError });
      } catch (invokeError: any) {
        console.error('[ScanTab] Edge function invoke failed:', invokeError);
        // Update scan to failed status
        await supabase.from('scans').update({
          status: 'failed',
          finished_at: new Date().toISOString(),
          summary_json: { error: invokeError.message || 'Edge function invoke failed' },
        }).eq('id', scan.id);
        throw new Error(`שגיאה בחיבור לשרת AI: ${invokeError.message || 'Unknown error'}`);
      }

      if (analysisError) {
        console.error('[ScanTab] AI analysis error:', analysisError);
        // Check for specific error types
        const errorMessage = analysisError.message || '';
        if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
          toast.error('הגעת למגבלת הבקשות. נסה שוב בעוד דקה.');
          throw new Error('מגבלת בקשות - נסה שוב בעוד דקה');
        }
        if (errorMessage.includes('402') || errorMessage.includes('payment')) {
          toast.error('נדרש תשלום - הקרדיטים נגמרו');
          throw new Error('נדרש תשלום - הקרדיטים נגמרו');
        }
        // Update scan to failed status
        await supabase.from('scans').update({
          status: 'failed',
          finished_at: new Date().toISOString(),
          summary_json: { error: errorMessage },
        }).eq('id', scan.id);
        throw new Error(analysisError.message || 'שגיאה בניתוח AI');
      }

      setProgress(80);

      const aiResult = analysisData as LovableAIResult;
      console.log('[ScanTab] Gemini 3 Pro result:', {
        threatDetected: aiResult.threatDetected,
        riskLevel: aiResult.riskLevel,
        alertsCount: aiResult.alerts?.length || 0,
      });

      // Handle rate limiting or payment errors from the edge function response
      if ((aiResult as any)?.error) {
        console.error('[ScanTab] AI result contains error:', (aiResult as any).error);
        // Update scan to failed status
        await supabase.from('scans').update({
          status: 'failed',
          finished_at: new Date().toISOString(),
          summary_json: { error: (aiResult as any).error },
        }).eq('id', scan.id);
        throw new Error((aiResult as any).error);
      }

      // Create finding - save even when no threats for record keeping
      if (scan) {
        const findingInsert = {
          scan_id: scan.id,
          child_id: child.id,
          threat_detected: aiResult.threatDetected || false,
          risk_level: aiResult.riskLevel || null,
          threat_types: aiResult.threatTypes || [],
          explanation: aiResult.explanation || 'לא זוהו סיכונים',
          ai_response_encrypted: aiResult as any, // Store full AI response including alerts
        };
        
        const { error: findingError } = await supabase.from('findings').insert(findingInsert);

        if (findingError) {
          console.error('Error saving finding:', findingError);
        }

        // Send email alert to parent for each high-confidence alert
        if (aiResult.threatDetected && aiResult.riskLevel && aiResult.alerts?.length > 0) {
          try {
            const { data: session } = await supabase.auth.getSession();
            const { data: profile } = await supabase
              .from('profiles')
              .select('email')
              .eq('id', session?.session?.user?.id)
              .single();

            if (profile?.email) {
              // Build alert details for email
              const alertSummaries = aiResult.alerts.map((alert: GeminiAlert) => {
                const typeLabels: Record<string, string> = {
                  'bullying_ostracism': 'חרם/בריונות',
                  'sexual_violence_or_exploitation': 'ניצול מיני',
                  'drugs_or_alcohol': 'סמים/אלכוהול',
                  'threats_or_violence': 'איומים/אלימות',
                  'hate_speech': 'גזענות/שנאה',
                };
                return `${typeLabels[alert.type] || alert.type}: ${alert.summary}`;
              }).join('\n');

              const triggersPreview = aiResult.alerts
                .flatMap((a: GeminiAlert) => a.triggers?.slice(0, 2) || [])
                .map((t: any) => `"${t.preview?.slice(0, 100)}..."`)
                .slice(0, 5)
                .join('\n');

              // Build recommendations based on alert types
              const recommendations = aiResult.alerts.map((alert: GeminiAlert) => {
                const recs: Record<string, string> = {
                  'bullying_ostracism': 'שוחחו עם הילד על מה שקורה ופנו לצוות החינוכי',
                  'sexual_violence_or_exploitation': 'פנו מיד לגורם מקצועי ושקלו דיווח לרשויות',
                  'drugs_or_alcohol': 'שוחחו עם הילד ופנו לייעוץ מקצועי',
                  'threats_or_violence': 'תעדו ודווחו לרשויות המתאימות',
                  'hate_speech': 'שוחחו עם הילד על ערכי סובלנות וכבוד',
                };
                return recs[alert.type] || `בדקו את הנושא: ${alert.type}`;
              });

              await supabase.functions.invoke('send-alert-email', {
                body: {
                  to: profile.email,
                  child_name: child.display_name,
                  risk_level: aiResult.riskLevel,
                  summary: `${aiResult.explanation}\n\nפירוט התראות:\n${alertSummaries}`,
                  original_message: triggersPreview || undefined,
                  recommendations: recommendations,
                }
              });
              console.log('Alert email sent to parent');
            }
          } catch (emailError) {
            console.error('Error sending alert email:', emailError);
            // Don't fail the scan if email fails
          }
        }
      }

      setProgress(90);

      // Update scan with results
      const summaryJson = {
        threat_detected: aiResult.threatDetected,
        risk_level: aiResult.riskLevel,
        threat_count: aiResult.threatDetected ? 1 : 0,
        alerts_count: aiResult.alerts?.length || 0,
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
        alertsCount: aiResult.alerts?.length || 0,
      });

      if (aiResult.threatDetected) {
        toast.warning('זוהו סיכונים פוטנציאליים!');
      } else {
        toast.success('לא זוהו סיכונים');
      }

      // Update lastScanAt in state
      setLastScanAt(new Date().toISOString());

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
          {!scanning && !result && !messagePreview && (
            <>
              <div className="glass-card p-4 rounded-xl space-y-3">
                <p className="text-sm text-muted-foreground">
                  <strong className="text-foreground">ניתוח AI:</strong> הסריקה משתמשת ב-AI לזיהוי סיכונים חמורים בלבד כמו חרם, איומים, הטרדה מינית, ופגיעה עצמית.
                </p>
                
                <div className="flex items-center gap-3">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <Label className="text-sm font-medium">טווח סריקה:</Label>
                  <Select value={scanTimeRange} onValueChange={(v) => setScanTimeRange(v as ScanTimeRange)}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="since_last_scan">
                        {lastScanAt ? `מאז ${new Date(lastScanAt).toLocaleDateString('he-IL')}` : 'כל ההודעות'}
                      </SelectItem>
                      <SelectItem value="all">כל ההודעות</SelectItem>
                      <SelectItem value="last_week">שבוע אחרון</SelectItem>
                      <SelectItem value="last_month">חודש אחרון</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex gap-3">
                <Button onClick={fetchMessagesPreview} variant="outline" size="lg" className="flex-1">
                  <Eye className="w-5 h-5" />
                  הצג תקציר הודעות
                </Button>
                <Button onClick={startScan} variant="glow" size="lg" className="flex-1">
                  <Zap className="w-5 h-5" />
                  התחל סריקה
                </Button>
              </div>
            </>
          )}

          {messagePreview && !scanning && !result && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-heebo font-bold text-lg">תקציר הודעות לניתוח</h3>
                <Button variant="ghost" size="sm" onClick={() => setMessagePreview(null)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
              
              <div className="glass-card p-4 rounded-xl space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-semibold text-foreground">סה"כ הודעות</p>
                    <p className="text-2xl font-bold text-primary">{messagePreview.messagesCount}</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">יישלחו לניתוח</p>
                    <p className="text-2xl font-bold text-primary">{messagePreview.messagesCount}</p>
                  </div>
                </div>
                
                <div className="border-t pt-3">
                  <p className="text-sm font-semibold mb-2">פירוט לפי סוג:</p>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">📝 טקסט: {messagePreview.textCount}</Badge>
                    <Badge variant="secondary">🖼️ תמונות: {messagePreview.imageCount}</Badge>
                    <Badge variant="secondary">🎤 הודעות קוליות: {messagePreview.audioCount}</Badge>
                    <Badge variant="secondary">🎬 וידאו: {messagePreview.videoCount}</Badge>
                  </div>
                </div>

                <div className="border-t pt-3">
                  <p className="text-sm font-semibold mb-1">טווח זמן:</p>
                  <p className="text-sm text-muted-foreground">
                    {messagePreview.oldestMessageAt
                      ? new Date(messagePreview.oldestMessageAt).toLocaleString('he-IL')
                      : '—'}{' '}
                    →{' '}
                    {messagePreview.newestMessageAt
                      ? new Date(messagePreview.newestMessageAt).toLocaleString('he-IL')
                      : '—'}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="font-bold">הפרומפט המדויק שיישלח ל-AI:</Label>
                <ScrollArea className="h-[400px] border rounded-lg p-3 bg-muted/30">
                  <pre className="text-xs whitespace-pre-wrap font-mono text-foreground" dir="rtl">
                    {messagePreview.exactPrompt}
                  </pre>
                </ScrollArea>
              </div>

              <div className="glass-card p-3 rounded-lg bg-primary/5 border border-primary/20">
                <p className="text-sm text-muted-foreground">
                  <strong className="text-foreground">💡 הערה:</strong> בזמן הסריקה, תמונות יורדו כ-Base64, הודעות קוליות יתומללו, וידאו ינותח ויתומלל - והפרומפט יתעדכן עם התוצאות.
                </p>
              </div>

              {/* Test with Lovable AI button */}
              <div className="border-t pt-4">
                <Button 
                  onClick={testWithLovableAI} 
                  variant="outline" 
                  size="lg" 
                  className="w-full bg-gradient-to-r from-purple-500/10 to-pink-500/10 border-purple-500/30 hover:border-purple-500/50"
                  disabled={testingLovable}
                >
                  {testingLovable ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      בודק עם Lovable AI...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5 text-purple-500" />
                      בדוק עם Lovable AI (Gemini)
                    </>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  שולח את ההודעות + תמונות + אודיו + וידאו ל-Gemini לניתוח
                </p>
              </div>

              {/* Lovable AI Result */}
              {lovableResult && (
                <div className="space-y-3 border-t pt-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-heebo font-bold text-md flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-purple-500" />
                      תוצאת Lovable AI
                    </h4>
                    <Badge variant="secondary">{lovableResult.model}</Badge>
                  </div>
                  
                  <div className="glass-card p-3 rounded-lg space-y-2 text-sm">
                    <div className="flex gap-4 text-muted-foreground">
                      <span>📊 הודעות: {lovableResult.messages_analyzed}</span>
                      <span>🖼️ תמונות: {lovableResult.images_analyzed || 0}</span>
                    </div>
                    {lovableResult.threatDetected && (
                      <div className="flex items-center gap-2">
                        <Badge variant={
                          lovableResult.riskLevel === 'critical' ? 'riskCritical' :
                          lovableResult.riskLevel === 'high' ? 'riskHigh' :
                          lovableResult.riskLevel === 'medium' ? 'riskMedium' : 'riskLow'
                        }>
                          רמת סיכון: {lovableResult.riskLevel}
                        </Badge>
                        <span className="text-warning">⚠️ {lovableResult.alerts?.length || 0} התראות</span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label className="font-bold">תשובת ה-AI:</Label>
                    <ScrollArea className="h-[300px] border rounded-lg p-3 bg-muted/30">
                      <pre className="text-xs whitespace-pre-wrap font-mono text-foreground" dir="rtl">
                        {JSON.stringify({
                          threatDetected: lovableResult.threatDetected,
                          riskLevel: lovableResult.riskLevel,
                          threatTypes: lovableResult.threatTypes,
                          alerts: lovableResult.alerts,
                          explanation: lovableResult.explanation,
                        }, null, 2)}
                      </pre>
                    </ScrollArea>
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <Button onClick={() => { setMessagePreview(null); setLovableResult(null); }} variant="outline" size="lg" className="flex-1">
                  חזרה
                </Button>
                <Button onClick={startScan} variant="glow" size="lg" className="flex-1">
                  <Zap className="w-5 h-5" />
                  התחל סריקה (Gemini 3 Pro)
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
                      <span className="text-2xl font-bold text-primary">{result.alertsCount}</span>
                      <p className="text-sm text-muted-foreground">התראות</p>
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
