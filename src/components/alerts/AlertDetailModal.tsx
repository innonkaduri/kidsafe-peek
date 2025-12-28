import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  User, 
  FileText,
  Lightbulb,
  MessageSquare,
  X,
  Send,
  Users,
  Share2,
  Copy
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { TeacherChatSection } from './TeacherChatSection';

interface Trigger {
  messageId: string;
  preview: string;
  type: string;
  confidence: number;
}

interface AIResponse {
  triggers?: Trigger[];
  patterns?: Array<{
    chatId: string;
    description: string;
    patternType: string;
    confidence: number;
  }>;
}

interface Finding {
  id: string;
  child_id: string;
  scan_id: string;
  threat_detected: boolean;
  risk_level: string | null;
  threat_types: string[] | null;
  explanation: string | null;
  created_at: string;
  child_name?: string;
  handled?: boolean;
  handled_at?: string | null;
  ai_response_encrypted?: AIResponse | null;
}

interface MessageInfo {
  id: string;
  sender_label: string;
  text_content: string | null;
  chat_name: string;
  is_group: boolean;
  preview?: string;
}

interface AlertDetailModalProps {
  finding: Finding | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: () => void;
}

export function AlertDetailModal({ finding, open, onOpenChange, onUpdate }: AlertDetailModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSharingWithTeacher, setIsSharingWithTeacher] = useState(false);
  const [teacherEmail, setTeacherEmail] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageInfo[]>([]);
  const [teacherAlertId, setTeacherAlertId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [fullFinding, setFullFinding] = useState<Finding | null>(null);

  useEffect(() => {
    if (finding && open) {
      fetchFullFinding();
      fetchTeacherEmail();
      fetchTeacherAlert();
      fetchUserId();
    }
  }, [finding, open]);

  const fetchUserId = async () => {
    const { data } = await supabase.auth.getSession();
    setUserId(data.session?.user?.id || null);
  };

  const fetchTeacherAlert = async () => {
    if (!finding) return;
    const { data } = await supabase
      .from('teacher_alerts')
      .select('id')
      .eq('finding_id', finding.id)
      .maybeSingle();
    setTeacherAlertId(data?.id || null);
  };

  const fetchFullFinding = async () => {
    if (!finding) return;
    
    setLoadingMessages(true);
    
    // Get the full finding with ai_response_encrypted
    const { data: findingData } = await supabase
      .from('findings')
      .select('*')
      .eq('id', finding.id)
      .single();
    
    if (findingData) {
      const aiResponse = findingData.ai_response_encrypted as AIResponse | null;
      setFullFinding({
        ...finding,
        ai_response_encrypted: aiResponse
      });
      
      // Extract message IDs from triggers
      if (aiResponse?.triggers && aiResponse.triggers.length > 0) {
        const messageIds = aiResponse.triggers
          .map(t => t.messageId)
          .filter(id => id && !id.includes('T')); // Filter out timestamp-like IDs
        
        if (messageIds.length > 0) {
          const { data: messagesData } = await supabase
            .from('messages')
            .select('id, sender_label, text_content, text_excerpt, chat_id')
            .in('id', messageIds);
          
          if (messagesData && messagesData.length > 0) {
            const chatIds = [...new Set(messagesData.map(m => m.chat_id))];
            
            const { data: chats } = await supabase
              .from('chats')
              .select('id, chat_name, is_group')
              .in('id', chatIds);
            
            const messagesWithChats: MessageInfo[] = messagesData.map(m => {
              const chat = chats?.find(c => c.id === m.chat_id);
              const trigger = aiResponse.triggers?.find(t => t.messageId === m.id);
              return {
                id: m.id,
                sender_label: m.sender_label,
                text_content: m.text_content || m.text_excerpt || null,
                chat_name: chat?.chat_name || 'לא ידוע',
                is_group: chat?.is_group || false,
                preview: trigger?.preview
              };
            });
            
            setMessages(messagesWithChats);
          } else {
            // Fallback: use preview from triggers directly
            const fallbackMessages: MessageInfo[] = aiResponse.triggers.map((t, idx) => ({
              id: `trigger-${idx}`,
              sender_label: 'לא ידוע',
              text_content: t.preview,
              chat_name: aiResponse.patterns?.[0]?.chatId || 'לא ידוע',
              is_group: false,
              preview: t.preview
            }));
            setMessages(fallbackMessages);
          }
        } else {
          // Use preview from triggers when messageIds are timestamps
          const fallbackMessages: MessageInfo[] = aiResponse.triggers.map((t, idx) => ({
            id: `trigger-${idx}`,
            sender_label: 'לא ידוע',
            text_content: t.preview,
            chat_name: aiResponse.patterns?.[0]?.chatId || 'לא ידוע',
            is_group: false,
            preview: t.preview
          }));
          setMessages(fallbackMessages);
        }
      }
    }
    
    setLoadingMessages(false);
  };

  const fetchTeacherEmail = async () => {
    if (!finding) return;
    
    const { data } = await supabase
      .from('children')
      .select('teacher_email')
      .eq('id', finding.child_id)
      .single();
    
    if (data) {
      setTeacherEmail(data.teacher_email);
    }
  };

  if (!finding) return null;

  const getRiskLevelStyle = (level: string | null) => {
    switch (level) {
      case 'critical':
        return 'bg-destructive text-destructive-foreground';
      case 'high':
        return 'bg-destructive/80 text-destructive-foreground';
      case 'medium':
        return 'bg-warning text-warning-foreground';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const getRiskLevelText = (level: string | null) => {
    switch (level) {
      case 'critical':
        return 'קריטי';
      case 'high':
        return 'גבוה';
      case 'medium':
        return 'בינוני';
      default:
        return 'נמוך';
    }
  };

  const getRecommendation = (threatTypes: string[] | null, riskLevel: string | null) => {
    if (!threatTypes || threatTypes.length === 0) {
      return 'מומלץ לעקוב אחר הפעילות ולבדוק מחדש בהמשך.';
    }
    
    const recommendations: Record<string, string> = {
      'חרם': 'מומלץ לשוחח עם הילד על מה שקורה בבית הספר ולפנות לצוות החינוכי.',
      'השפלה מתמשכת או אלימות רגשית קשה': 'יש לפנות מיידית לגורם מקצועי ולשקול דיווח לרשויות הרווחה.',
      'בריונות': 'מומלץ לתעד את האירועים ולפנות להנהלת בית הספר.',
      'harassment_bullying': 'מומלץ לתעד את האירועים ולפנות להנהלת בית הספר.',
      'תוכן מיני': 'יש לשוחח עם הילד בזהירות ולשקול פנייה לגורם מקצועי.',
      'סחיטה': 'יש לדווח לרשויות ולא להיענות לדרישות הסוחט.',
      'אלימות': 'יש לתעד ולדווח לרשויות המתאימות.',
      'סמים': 'מומלץ לשוחח עם הילד ולפנות לייעוץ מקצועי.',
    };

    for (const type of threatTypes) {
      if (recommendations[type]) {
        return recommendations[type];
      }
    }

    if (riskLevel === 'critical' || riskLevel === 'high') {
      return 'מומלץ לפנות לגורם מקצועי לקבלת ייעוץ וליווי.';
    }

    return 'מומלץ לעקוב אחר הפעילות ולשוחח עם הילד על חווייתו ברשת.';
  };

  const handleMarkAsHandled = async () => {
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('findings')
        .update({ 
          handled: true, 
          handled_at: new Date().toISOString(),
          threat_detected: false
        })
        .eq('id', finding.id);

      if (error) throw error;

      toast.success('ההתראה סומנה כטופלה');
      onUpdate();
      onOpenChange(false);
    } catch (error) {
      console.error('Error marking as handled:', error);
      toast.error('שגיאה בעדכון ההתראה');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Build share text for native share / clipboard
  const buildShareText = () => {
    const date = new Date(finding.created_at).toLocaleDateString('he-IL', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    let text = `🚨 התראת SafeKids\n\n`;
    text += `ילד/ה: ${finding.child_name}\n`;
    text += `רמת סיכון: ${getRiskLevelText(finding.risk_level)}\n`;
    text += `תאריך: ${date}\n`;
    
    if (finding.threat_types && finding.threat_types.length > 0) {
      text += `סוג איום: ${finding.threat_types.join(', ')}\n`;
    }
    
    text += `\n📝 תקציר:\n${finding.explanation || 'לא נמצא תיאור'}\n`;
    
    if (messages.length > 0) {
      text += `\n💬 הודעות שזוהו:\n`;
      messages.forEach(msg => {
        text += `• ${formatSenderInfo(msg)}: ${msg.text_content || msg.preview || ''}\n`;
      });
    }
    
    text += `\n📌 המלצה:\n${getRecommendation(finding.threat_types, finding.risk_level)}`;
    
    return text;
  };

  const handleShareWithTeacher = async () => {
    if (!teacherEmail) {
      toast.error('לא הוגדר מייל מורה לילד זה');
      return;
    }

    setIsSharingWithTeacher(true);
    
    const shareText = buildShareText();
    
    // Try native share API (mobile), fallback to clipboard (desktop)
    const shareNatively = async () => {
      if (navigator.share) {
        try {
          await navigator.share({
            title: '🚨 התראת SafeKids',
            text: shareText,
          });
        } catch (err) {
          // User cancelled or share failed - still proceed with teacher alert
          console.log('Native share cancelled or failed:', err);
        }
      } else {
        // Desktop fallback - copy to clipboard
        try {
          await navigator.clipboard.writeText(shareText);
          toast.success('הטקסט הועתק ללוח');
        } catch (err) {
          console.error('Clipboard failed:', err);
        }
      }
    };

    // Share to teacher in database
    const shareToTeacher = async () => {
      try {
        const { data: session } = await supabase.auth.getSession();
        if (!session?.session?.user) throw new Error('User not authenticated');

        const { error } = await supabase
          .from('teacher_alerts')
          .insert({
            child_id: finding.child_id,
            parent_user_id: session.session.user.id,
            teacher_email: teacherEmail,
            finding_id: finding.id,
            severity: finding.risk_level || 'medium',
            category: finding.threat_types?.[0] || 'אחר',
            parent_message: finding.explanation || 'זוהתה התראה שמחייבת תשומת לב'
          });

        if (error) throw error;
        toast.success('ההתראה שותפה עם המורה בהצלחה');
      } catch (error) {
        console.error('Error sharing with teacher:', error);
        toast.error('שגיאה בשיתוף עם המורה');
      }
    };

    // Execute both actions in parallel
    await Promise.all([shareNatively(), shareToTeacher()]);
    
    setIsSharingWithTeacher(false);
  };

  const formatSenderInfo = (message: MessageInfo) => {
    if (message.is_group) {
      return `${message.chat_name} • ${message.sender_label}`;
    }
    return message.sender_label;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto glass-card border-border">
        <DialogHeader className="pb-4">
          <div className="flex items-center justify-between">
            <DialogTitle className="font-heebo text-xl flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                finding.risk_level === 'critical' || finding.risk_level === 'high' 
                  ? 'bg-destructive/20' 
                  : 'bg-warning/20'
              }`}>
                <AlertTriangle className={`w-5 h-5 ${
                  finding.risk_level === 'critical' || finding.risk_level === 'high' 
                    ? 'text-destructive' 
                    : 'text-warning'
                }`} />
              </div>
              פרטי התראה
            </DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Status Bar */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-card/50 border border-border">
            <div className="flex items-center gap-3">
              <User className="w-5 h-5 text-muted-foreground" />
              <span className="font-medium text-foreground">{finding.child_name}</span>
            </div>
            <div className="flex items-center gap-3">
              <Badge className={getRiskLevelStyle(finding.risk_level)}>
                {getRiskLevelText(finding.risk_level)}
              </Badge>
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Clock className="w-4 h-4" />
                {new Date(finding.created_at).toLocaleDateString('he-IL', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </div>
            </div>
          </div>

          {/* Sender Info & Message Content */}
          {messages.length > 0 && (
            <div className="space-y-3">
              <h4 className="font-heebo font-semibold text-foreground flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                הודעות שזוהו
              </h4>
              <div className="space-y-3">
                {messages.map((message, index) => (
                  <div key={message.id || index} className="p-4 rounded-xl bg-card/30 border border-border space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {message.is_group && (
                        <Badge variant="outline" className="text-xs">קבוצה</Badge>
                      )}
                      <span className="text-sm font-medium text-primary">
                        {formatSenderInfo(message)}
                      </span>
                    </div>
                    <div className="p-3 rounded-lg bg-background/50 border border-border/50">
                      <p className="text-foreground text-sm leading-relaxed whitespace-pre-wrap">
                        {message.text_content || message.preview || 'תוכן לא זמין'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {loadingMessages && (
            <div className="p-4 rounded-xl bg-card/30 border border-border text-center">
              <p className="text-muted-foreground text-sm">טוען פרטי הודעות...</p>
            </div>
          )}

          {/* Threat Types */}
          {finding.threat_types && finding.threat_types.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-heebo font-semibold text-foreground flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-destructive" />
                סוגי איומים שזוהו
              </h4>
              <div className="flex flex-wrap gap-2">
                {finding.threat_types.map((type, index) => (
                  <Badge 
                    key={index} 
                    variant="outline" 
                    className="bg-destructive/10 text-destructive border-destructive/30"
                  >
                    {type}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <Separator className="bg-border" />

          {/* Event Summary */}
          <div className="space-y-3">
            <h4 className="font-heebo font-semibold text-foreground flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              תקציר האירוע
            </h4>
            <div className="p-4 rounded-xl bg-card/30 border border-border">
              <p className="text-foreground leading-relaxed">
                {finding.explanation || 'לא נמצא תיאור מפורט לאירוע זה. מומלץ לבדוק את ההודעות הקשורות לקבלת מידע נוסף.'}
              </p>
            </div>
          </div>

          {/* Analysis */}
          <div className="space-y-3">
            <h4 className="font-heebo font-semibold text-foreground flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-primary" />
              ניתוח קצר
            </h4>
            <div className="p-4 rounded-xl bg-card/30 border border-border">
              <p className="text-foreground leading-relaxed">
                המערכת זיהתה תוכן שעשוי להצביע על {finding.threat_types?.join(', ') || 'בעיה פוטנציאלית'}.
                {finding.risk_level === 'critical' || finding.risk_level === 'high' 
                  ? ' רמת הסיכון מצביעה על צורך בטיפול מיידי.'
                  : ' מומלץ לעקוב אחר ההתפתחויות.'}
              </p>
            </div>
          </div>

          {/* Recommendation */}
          <div className="space-y-3">
            <h4 className="font-heebo font-semibold text-foreground flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-warning" />
              המלצה
            </h4>
            <div className="p-4 rounded-xl bg-warning/10 border border-warning/30">
              <p className="text-foreground leading-relaxed">
                {getRecommendation(finding.threat_types, finding.risk_level)}
              </p>
            </div>
          </div>

          {/* Teacher Chat Section - show if alert was shared */}
          {teacherAlertId && userId && teacherEmail && (
            <>
              <Separator className="bg-border" />
              <TeacherChatSection
                alertId={teacherAlertId}
                userId={userId}
                teacherEmail={teacherEmail}
              />
            </>
          )}

          <Separator className="bg-border" />

          {/* Actions */}
          <div className="flex flex-col gap-3 pt-4">
            <div className="flex items-center gap-3">
              <Button
                onClick={handleMarkAsHandled}
                disabled={isSubmitting}
                className="flex-1 bg-success hover:bg-success/90 text-success-foreground"
              >
                <CheckCircle className="w-4 h-4 ml-2" />
                {isSubmitting ? 'מעדכן...' : 'סמן כטופל'}
              </Button>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="border-border"
              >
                <X className="w-4 h-4 ml-2" />
                סגור
              </Button>
            </div>
            
            {teacherEmail && (
              <Button
                onClick={handleShareWithTeacher}
                disabled={isSharingWithTeacher}
                variant="outline"
                className="w-full border-primary text-primary hover:bg-primary/10"
              >
                <Share2 className="w-4 h-4 ml-2" />
                {isSharingWithTeacher ? 'משתף...' : `שתף עם המורה (${teacherEmail})`}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
