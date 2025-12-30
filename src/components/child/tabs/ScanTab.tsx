import { useState, useEffect } from 'react';
import { Scan as ScanIcon, Loader2, CheckCircle, AlertTriangle, Zap, Eye, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Child } from '@/types/database';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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
  sampleMessages: Array<{
    sender: string;
    type: string;
    preview: string;
    time: string;
  }>;
}

export function ScanTab({ child, onScanComplete }: ScanTabProps) {
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [lastScanAt, setLastScanAt] = useState<string | null>(null);
  const [messagePreview, setMessagePreview] = useState<MessagePreview | null>(null);
  const [result, setResult] = useState<{
    threatDetected: boolean;
    riskLevel: string | null;
    findingsCount: number;
    patternsCount: number;
  } | null>(null);

  // Fetch last scan date
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

  // Fetch messages and build simple preview
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

      if (lastScanAt) {
        query = query.gt('message_timestamp', lastScanAt);
      }

      const { data: messages, error: messagesError } = await query;

      if (messagesError) throw messagesError;

      const allMessages = messages || [];
      
      // Count by type
      const textCount = allMessages.filter(m => m.msg_type === 'text').length;
      const imageCount = allMessages.filter(m => m.msg_type === 'image' && m.media_url).length;
      const audioCount = allMessages.filter(m => m.msg_type === 'audio' && m.media_url).length;
      const videoCount = allMessages.filter(m => m.msg_type === 'video' && m.media_url).length;

      // Get sample messages (first 3 and last 3)
      const limitedMessages = allMessages.slice(-50);
      const sampleMessages = [
        ...limitedMessages.slice(0, 3),
        ...limitedMessages.slice(-3)
      ].filter((msg, index, self) => 
        self.findIndex(m => m.id === msg.id) === index
      ).map((msg: any) => {
        let preview = msg.text_content || '';
        if (msg.msg_type === 'image') preview = '🖼️ תמונה';
        else if (msg.msg_type === 'audio') preview = '🎤 הודעה קולית';
        else if (msg.msg_type === 'video') preview = '🎬 וידאו';
        else if (!preview) preview = '[הודעה ריקה]';
        
        return {
          sender: msg.sender_label,
          type: msg.msg_type,
          preview: preview.slice(0, 100),
          time: msg.message_timestamp,
        };
      });

      setMessagePreview({
        messagesCount: allMessages.length,
        textCount,
        imageCount,
        audioCount,
        videoCount,
        oldestMessageAt: allMessages[0]?.message_timestamp ?? null,
        newestMessageAt: allMessages[allMessages.length - 1]?.message_timestamp ?? null,
        sampleMessages,
      });
    } catch (error: any) {
      console.error('Error fetching messages preview:', error);
      toast.error('שגיאה בטעינת ההודעות: ' + error.message);
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

      if (lastScanAt) {
        query = query.gt('message_timestamp', lastScanAt);
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

      // Call AI analysis edge function
      console.log('[ScanTab] Invoking analyze-threats edge function...');
      let analysisData: any;
      let analysisError: any;
      
      try {
        const result = await supabase.functions.invoke('analyze-threats', {
          body: {
            child_id: child.id,
            scan_id: scan.id,
            messages: formattedMessages,
          },
        });
        analysisData = result.data;
        analysisError = result.error;
        console.log('[ScanTab] Edge function response received:', { hasData: !!analysisData, hasError: !!analysisError });
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

      const aiResult = analysisData;
      console.log('[ScanTab] AI analysis result:', aiResult);

      // Handle rate limiting or payment errors from the edge function response
      if (aiResult?.error) {
        console.error('[ScanTab] AI result contains error:', aiResult.error);
        // Update scan to failed status
        await supabase.from('scans').update({
          status: 'failed',
          finished_at: new Date().toISOString(),
          summary_json: { error: aiResult.error },
        }).eq('id', scan.id);
        throw new Error(aiResult.error);
      }

      // Create finding - save even when no threats for record keeping
      if (scan) {
        const { data: findingData, error: findingError } = await supabase.from('findings').insert({
          scan_id: scan.id,
          child_id: child.id,
          threat_detected: aiResult.threatDetected || false,
          risk_level: aiResult.riskLevel || null,
          threat_types: aiResult.threatTypes || [],
          explanation: aiResult.explanation || 'לא זוהו סיכונים',
          ai_response_encrypted: aiResult, // Store full AI response
        }).select('id').single();

        if (findingError) {
          console.error('Error saving finding:', findingError);
        }

        // Send email alert to parent if threat detected
        if (aiResult.threatDetected && aiResult.riskLevel) {
          try {
            const { data: session } = await supabase.auth.getSession();
            const { data: profile } = await supabase
              .from('profiles')
              .select('email')
              .eq('id', session?.session?.user?.id)
              .single();

            if (profile?.email) {
              await supabase.functions.invoke('send-alert-email', {
                body: {
                  to: profile.email,
                  child_name: child.display_name,
                  risk_level: aiResult.riskLevel,
                  summary: aiResult.explanation || 'זוהתה התראה שמחייבת תשומת לב',
                  recommendations: aiResult.threatTypes?.map((type: string) => {
                    const recommendations: Record<string, string> = {
                      'חרם': 'שוחחו עם הילד על מה שקורה בבית הספר ופנו לצוות החינוכי',
                      'בריונות': 'תעדו את האירועים ופנו להנהלת בית הספר',
                      'תוכן מיני': 'שוחחו עם הילד בזהירות ושקלו פנייה לגורם מקצועי',
                      'סחיטה': 'דווחו לרשויות ואל תיענו לדרישות הסוחט',
                      'אלימות': 'תעדו ודווחו לרשויות המתאימות',
                      'סמים': 'שוחחו עם הילד ופנו לייעוץ מקצועי',
                    };
                    return recommendations[type] || `בדקו את הנושא: ${type}`;
                  })
                }
              });
              console.log('Alert email sent to parent');
            }
          } catch (emailError) {
            console.error('Error sending alert email:', emailError);
            // Don't fail the scan if email fails
          }
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
              <div className="glass-card p-4 rounded-xl space-y-2">
                <p className="text-sm text-muted-foreground">
                  <strong className="text-foreground">ניתוח AI:</strong> הסריקה משתמשת ב-AI לזיהוי סיכונים חמורים בלבד כמו חרם, איומים, הטרדה מינית, ופגיעה עצמית.
                </p>
                <p className="text-sm text-muted-foreground">
                  <strong className="text-foreground">טווח סריקה:</strong>{' '}
                  {lastScanAt 
                    ? `הודעות מאז ${new Date(lastScanAt).toLocaleString('he-IL')}`
                    : 'כל ההודעות (סריקה ראשונה)'}
                </p>
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
                    <p className="text-2xl font-bold text-primary">{Math.min(messagePreview.messagesCount, 50)}</p>
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

              {messagePreview.sampleMessages.length > 0 && (
                <div className="space-y-2">
                  <Label className="font-bold">דוגמאות מההודעות:</Label>
                  <ScrollArea className="h-[200px] border rounded-lg p-3 bg-muted/30">
                    <div className="space-y-2">
                      {messagePreview.sampleMessages.map((msg, idx) => (
                        <div key={idx} className="p-2 rounded bg-background/50 text-sm">
                          <span className="font-medium">{msg.sender}:</span>{' '}
                          <span className="text-muted-foreground">{msg.preview}</span>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}

              <div className="glass-card p-3 rounded-lg bg-primary/5 border border-primary/20">
                <p className="text-sm text-muted-foreground">
                  <strong className="text-foreground">💡 מה יקרה:</strong> תמונות יורדו כ-Base64, הודעות קוליות יתומללו, וידאו ינותח ויתומלל - והכל יישלח ל-AI לזיהוי סיכונים.
                </p>
              </div>

              <div className="flex gap-3">
                <Button onClick={() => setMessagePreview(null)} variant="outline" size="lg" className="flex-1">
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
