import { useEffect, useState } from 'react';
import { AlertTriangle, Calendar, Filter, Eye, CheckCircle, Share2, CheckCheck, User, Users, MessageCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Child, Finding, RiskLevel, ThreatType } from '@/types/database';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow, format } from 'date-fns';
import { he } from 'date-fns/locale';
import { toast } from 'sonner';

interface FindingsTabProps {
  child: Child;
}

interface FindingWithContext extends Finding {
  senderName?: string;
  chatName?: string;
  isGroup?: boolean;
  messagePreview?: string;
}

const riskLabels: Record<RiskLevel, string> = {
  low: 'נמוך',
  medium: 'בינוני',
  high: 'גבוה',
  critical: 'קריטי',
};

const threatTypeLabels: Record<ThreatType, string> = {
  harassment_bullying: 'הטרדה/בריונות',
  coercion_pressure: 'כפייה/לחץ',
  extortion_blackmail: 'סחיטה',
  adult_inappropriate: 'תוכן לא הולם למבוגרים',
  scams_fraud: 'הונאה',
  violence_threats: 'איומים/אלימות',
};

const riskIcons: Record<string, { bg: string; icon: string }> = {
  critical: { bg: 'bg-risk-critical/20', icon: 'text-risk-critical' },
  high: { bg: 'bg-risk-high/20', icon: 'text-risk-high' },
  medium: { bg: 'bg-risk-medium/20', icon: 'text-risk-medium' },
  low: { bg: 'bg-risk-low/20', icon: 'text-risk-low' },
};

export function FindingsTab({ child }: FindingsTabProps) {
  const [findings, setFindings] = useState<FindingWithContext[]>([]);
  const [loading, setLoading] = useState(true);
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [selectedFinding, setSelectedFinding] = useState<FindingWithContext | null>(null);
  const [contextDialogOpen, setContextDialogOpen] = useState(false);
  const [contextMessages, setContextMessages] = useState<any[]>([]);
  const [loadingContext, setLoadingContext] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    fetchFindings();
  }, [child.id, riskFilter]);

  async function fetchFindings() {
    setLoading(true);
    
    let query = supabase
      .from('findings')
      .select('*')
      .eq('child_id', child.id)
      .eq('threat_detected', true)
      .order('created_at', { ascending: false });

    if (riskFilter !== 'all') {
      query = query.eq('risk_level', riskFilter);
    }

    const { data, error } = await query;
    
    if (!error && data) {
      // Fetch context for each finding
      const findingsWithContext = await Promise.all(
        data.map(async (finding) => {
          const { data: evidence } = await supabase
            .from('evidence_items')
            .select('message_id, preview_text')
            .eq('finding_id', finding.id)
            .limit(1);

          if (evidence && evidence.length > 0 && evidence[0].message_id) {
            const { data: message } = await supabase
              .from('messages')
              .select('sender_label, text_content, text_excerpt, chat_id')
              .eq('id', evidence[0].message_id)
              .single();

            if (message) {
              const { data: chat } = await supabase
                .from('chats')
                .select('chat_name, is_group')
                .eq('id', message.chat_id)
                .single();

              return {
                ...finding,
                senderName: message.sender_label,
                messagePreview: message.text_content || message.text_excerpt || evidence[0].preview_text,
                chatName: chat?.chat_name,
                isGroup: chat?.is_group,
              } as FindingWithContext;
            }
          }
          return finding as FindingWithContext;
        })
      );
      
      setFindings(findingsWithContext);
    }
    
    setLoading(false);
  }

  const handleMarkAsHandled = async (finding: FindingWithContext) => {
    setActionLoading(finding.id);
    
    try {
      const { error } = await supabase
        .from('findings')
        .update({ 
          handled: true, 
          handled_at: new Date().toISOString() 
        })
        .eq('id', finding.id);

      if (error) throw error;

      toast.success('הממצא סומן כטופל');
      fetchFindings();
    } catch (error: any) {
      toast.error('שגיאה בסימון: ' + error.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleShareWithTeacher = async (finding: FindingWithContext) => {
    if (!child.teacher_email) {
      toast.error('לא הוגדר מייל מורה. הגדירו בלשונית הגדרות.');
      return;
    }

    setActionLoading(finding.id);
    
    try {
      // Create a teacher_alert record
      const { error } = await supabase
        .from('teacher_alerts')
        .insert({
          child_id: child.id,
          finding_id: finding.id,
          parent_user_id: child.user_id,
          teacher_email: child.teacher_email,
          parent_message: `נמצא ממצא ברמת סיכון ${riskLabels[finding.risk_level as RiskLevel] || finding.risk_level}: ${finding.explanation}`,
          status: 'pending',
        });

      if (error) throw error;

      toast.success(`נשלחה התראה למורה: ${child.teacher_email}`);
    } catch (error: any) {
      toast.error('שגיאה בשליחה: ' + error.message);
    } finally {
      setActionLoading(null);
    }
  };

  const openContextDialog = async (finding: FindingWithContext) => {
    setSelectedFinding(finding);
    setContextDialogOpen(true);
    setLoadingContext(true);
    setContextMessages([]);

    const { data: evidenceItems } = await supabase
      .from('evidence_items')
      .select('message_id, preview_text')
      .eq('finding_id', finding.id);

    if (evidenceItems && evidenceItems.length > 0) {
      const messageIds = evidenceItems.map(e => e.message_id).filter(Boolean);
      
      if (messageIds.length > 0) {
        const { data: flaggedMessages } = await supabase
          .from('messages')
          .select('*, chats(chat_name)')
          .in('id', messageIds);

        if (flaggedMessages && flaggedMessages.length > 0) {
          const firstMessage = flaggedMessages[0];
          const chatId = firstMessage.chat_id;

          const { data: surroundingMessages } = await supabase
            .from('messages')
            .select('*, chats(chat_name)')
            .eq('chat_id', chatId)
            .order('message_timestamp', { ascending: true })
            .limit(20);

          if (surroundingMessages) {
            const flaggedIndex = surroundingMessages.findIndex(m => m.id === firstMessage.id);
            const start = Math.max(0, flaggedIndex - 5);
            const end = Math.min(surroundingMessages.length, flaggedIndex + 6);
            const contextSlice = surroundingMessages.slice(start, end);
            
            const flaggedIds = new Set(messageIds);
            const messagesWithFlags = contextSlice.map(m => ({
              ...m,
              isFlagged: flaggedIds.has(m.id)
            }));
            
            setContextMessages(messagesWithFlags);
          }
        }
      }
    }
    
    setLoadingContext(false);
  };

  const getRiskBorderColor = (level: string) => {
    switch (level) {
      case 'critical': return 'border-r-risk-critical';
      case 'high': return 'border-r-risk-high';
      case 'medium': return 'border-r-risk-medium';
      case 'low': return 'border-r-risk-low';
      default: return '';
    }
  };

  const getRiskStyles = (level: string | null) => {
    return riskIcons[level || 'low'] || riskIcons.low;
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">סינון:</span>
            </div>
            <Select value={riskFilter} onValueChange={setRiskFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="רמת סיכון" />
              </SelectTrigger>
              <SelectContent className="glass-card border-border">
                <SelectItem value="all">הכל</SelectItem>
                <SelectItem value="critical">קריטי</SelectItem>
                <SelectItem value="high">גבוה</SelectItem>
                <SelectItem value="medium">בינוני</SelectItem>
                <SelectItem value="low">נמוך</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Findings List */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-pulse">טוען ממצאים...</div>
        </div>
      ) : findings.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle className="w-16 h-16 mx-auto mb-4 text-success" />
            <h3 className="font-heebo font-bold text-xl mb-2">לא נמצאו ממצאים</h3>
            <p className="text-muted-foreground">
              לא זוהו סיכונים בשיחות שנסרקו
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {findings.map((finding) => {
            const riskStyles = getRiskStyles(finding.risk_level);
            const isHandled = finding.handled;
            
            return (
              <Card 
                key={finding.id} 
                variant="risk"
                className={`${finding.risk_level ? getRiskBorderColor(finding.risk_level) : ''} ${isHandled ? 'opacity-60' : ''}`}
              >
                <CardContent className="p-6">
                  {/* Header - Status and Risk */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-12 h-12 rounded-xl ${riskStyles.bg} flex items-center justify-center`}>
                        <AlertTriangle className={`w-6 h-6 ${riskStyles.icon}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {finding.risk_level && (
                            <Badge variant={
                              finding.risk_level === 'critical' ? 'riskCritical' :
                              finding.risk_level === 'high' ? 'riskHigh' :
                              finding.risk_level === 'medium' ? 'riskMedium' : 'riskLow'
                            }>
                              {riskLabels[finding.risk_level as RiskLevel]}
                            </Badge>
                          )}
                          {(finding.threat_types as ThreatType[])?.map((type) => (
                            <Badge key={type} variant="outline" className="text-xs">
                              {threatTypeLabels[type] || type}
                            </Badge>
                          ))}
                          {isHandled && (
                            <Badge variant="secondary" className="text-xs">
                              <CheckCheck className="w-3 h-3 ml-1" />
                              טופל
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                          <Calendar className="w-3 h-3" />
                          {format(new Date(finding.created_at), 'dd/MM/yyyy HH:mm', { locale: he })}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Summary - What happened */}
                  <div className="mb-4 p-4 rounded-xl bg-secondary/30 border border-border/50">
                    <h4 className="font-medium text-sm text-muted-foreground mb-2">תקציר:</h4>
                    <p className="text-sm leading-relaxed">{finding.explanation}</p>
                  </div>

                  {/* Message Content if available */}
                  {finding.messagePreview && (
                    <div className="mb-4 p-4 rounded-xl bg-background/50 border border-border/50">
                      <h4 className="font-medium text-sm text-muted-foreground mb-2 flex items-center gap-2">
                        <MessageCircle className="w-4 h-4" />
                        תוכן ההודעה:
                      </h4>
                      <p className="text-sm leading-relaxed font-medium" dir="auto">
                        "{finding.messagePreview}"
                      </p>
                    </div>
                  )}

                  {/* Sender and Chat Info */}
                  <div className="flex flex-wrap gap-4 mb-4 text-sm">
                    {finding.senderName && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <User className="w-4 h-4" />
                        <span>שולח: <span className="text-foreground font-medium">{finding.senderName}</span></span>
                      </div>
                    )}
                    {finding.chatName && finding.isGroup && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Users className="w-4 h-4" />
                        <span>קבוצה: <span className="text-foreground font-medium">{finding.chatName}</span></span>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap gap-2 pt-4 border-t border-border/50">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => openContextDialog(finding)}
                    >
                      <Eye className="w-4 h-4" />
                      הצג הקשר
                    </Button>
                    
                    {!isHandled && (
                      <>
                        <Button 
                          variant="glow" 
                          size="sm"
                          onClick={() => handleShareWithTeacher(finding)}
                          disabled={actionLoading === finding.id}
                        >
                          <Share2 className="w-4 h-4" />
                          שתף עם מורה
                        </Button>
                        
                        <Button 
                          variant="secondary" 
                          size="sm"
                          onClick={() => handleMarkAsHandled(finding)}
                          disabled={actionLoading === finding.id}
                        >
                          <CheckCheck className="w-4 h-4" />
                          סמן כטופל
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Context Dialog */}
      <Dialog open={contextDialogOpen} onOpenChange={setContextDialogOpen}>
        <DialogContent className="glass-card border-border max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-heebo">הקשר הממצא</DialogTitle>
          </DialogHeader>
          {selectedFinding && (
            <div className="space-y-4">
              <div className="glass-card p-4 rounded-xl">
                <h4 className="font-medium mb-2">הסבר:</h4>
                <p className="text-sm text-muted-foreground">{selectedFinding.explanation}</p>
              </div>
              
              <div className="glass-card p-4 rounded-xl">
                <h4 className="font-medium mb-2">הודעות סביבת הממצא:</h4>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {loadingContext ? (
                    <div className="text-center py-4 text-muted-foreground">טוען הודעות...</div>
                  ) : contextMessages.length === 0 ? (
                    <div className="text-center py-4 text-muted-foreground">לא נמצאו הודעות קשורות</div>
                  ) : (
                    contextMessages.map((msg) => (
                      <div 
                        key={msg.id}
                        className={`text-sm p-3 rounded-lg ${
                          msg.isFlagged 
                            ? 'bg-destructive/10 border border-destructive/30' 
                            : msg.is_child_sender 
                              ? 'bg-primary/10 mr-8' 
                              : 'bg-secondary/50'
                        }`}
                      >
                        <span className="text-muted-foreground text-xs">
                          {msg.is_child_sender ? 'הילד/ה' : msg.sender_label || 'זר'} • {formatDistanceToNow(new Date(msg.message_timestamp), { addSuffix: true, locale: he })}
                        </span>
                        <p>{msg.text_content || msg.text_excerpt || '[מדיה]'}</p>
                        {msg.isFlagged && (
                          <Badge variant="riskHigh" className="mt-2">ממצא</Badge>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}