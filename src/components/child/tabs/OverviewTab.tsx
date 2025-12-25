import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Shield, 
  MessageSquare, 
  AlertTriangle, 
  CheckCircle,
  Clock,
  TrendingUp,
  User,
  Users
} from 'lucide-react';
import { Child, Scan, Finding, RiskLevel } from '@/types/database';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { he } from 'date-fns/locale';

interface OverviewTabProps {
  child: Child;
}

interface RecentMessage {
  id: string;
  text_content: string | null;
  text_excerpt: string | null;
  sender_label: string;
  is_child_sender: boolean;
  message_timestamp: string;
  msg_type: string;
  chat_name?: string;
}

const riskLabels: Record<RiskLevel, string> = {
  low: 'נמוך',
  medium: 'בינוני',
  high: 'גבוה',
  critical: 'קריטי',
};

export function OverviewTab({ child }: OverviewTabProps) {
  const [lastScan, setLastScan] = useState<Scan | null>(null);
  const [recentFindings, setRecentFindings] = useState<Finding[]>([]);
  const [recentMessages, setRecentMessages] = useState<RecentMessage[]>([]);
  const [chatsCount, setChatsCount] = useState(0);
  const [messagesCount, setMessagesCount] = useState(0);
  const [lastMessageAt, setLastMessageAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    let pollInterval: NodeJS.Timeout | null = null;

    async function fetchOverviewData() {
      if (!mounted) return;

      // Fetch last scan
      const { data: scanData } = await supabase
        .from('scans')
        .select('*')
        .eq('child_id', child.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Fetch recent findings
      const { data: findingsData } = await supabase
        .from('findings')
        .select('*')
        .eq('child_id', child.id)
        .eq('threat_detected', true)
        .order('created_at', { ascending: false })
        .limit(5);

      // Fetch chats count
      const { count: chats } = await supabase
        .from('chats')
        .select('*', { count: 'exact', head: true })
        .eq('child_id', child.id);

      // Fetch messages count
      const { count: messages } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('child_id', child.id);

      // Fetch last message timestamp
      const { data: lastMsg } = await supabase
        .from('messages')
        .select('message_timestamp')
        .eq('child_id', child.id)
        .order('message_timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Fetch recent messages (last 20)
      const { data: recentMsgs } = await supabase
        .from('messages')
        .select(`
          id,
          text_content,
          text_excerpt,
          sender_label,
          is_child_sender,
          message_timestamp,
          msg_type,
          chats!inner(chat_name)
        `)
        .eq('child_id', child.id)
        .order('message_timestamp', { ascending: false })
        .limit(20);

      if (!mounted) return;

      setLastScan(scanData);
      setRecentFindings(findingsData || []);
      setChatsCount(chats || 0);
      setMessagesCount(messages || 0);
      setLastMessageAt(lastMsg?.message_timestamp ?? null);
      setRecentMessages(
        (recentMsgs || []).map((m: any) => ({
          ...m,
          chat_name: m.chats?.chat_name,
        }))
      );
      setLoading(false);
    }

    setLoading(true);
    fetchOverviewData();

    // Poll every 10 seconds for new messages
    pollInterval = setInterval(fetchOverviewData, 10000);

    // Realtime: refresh overview when a new message arrives for this child
    const channel = supabase
      .channel(`child:${child.id}:messages`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `child_id=eq.${child.id}`,
        },
        () => {
          fetchOverviewData();
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      if (pollInterval) {
        clearInterval(pollInterval);
      }
      supabase.removeChannel(channel);
    };
  }, [child.id]);

  const hasThreats = lastScan?.summary_json?.threat_detected;
  const riskLevel = lastScan?.summary_json?.risk_level as RiskLevel | undefined;

  return (
    <div className="space-y-6">
      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card variant="elevated">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                <Shield className="w-6 h-6 text-primary" />
              </div>
              {hasThreats ? (
                <Badge variant={riskLevel === 'critical' ? 'riskCritical' : riskLevel === 'high' ? 'riskHigh' : riskLevel === 'medium' ? 'riskMedium' : 'riskLow'}>
                  {riskLevel ? riskLabels[riskLevel] : 'לא ידוע'}
                </Badge>
              ) : (
                <Badge variant="success">בטוח</Badge>
              )}
            </div>
            <h3 className="font-heebo font-bold text-lg mb-1">סטטוס בטיחות</h3>
            <p className="text-sm text-muted-foreground">
              {hasThreats ? 'זוהו סיכונים פוטנציאליים' : 'לא זוהו איומים'}
            </p>
          </CardContent>
        </Card>

        <Card variant="elevated">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-cyan-500/20 flex items-center justify-center">
                <MessageSquare className="w-6 h-6 text-cyan-400" />
              </div>
              <span className="text-2xl font-heebo font-bold">{chatsCount}</span>
            </div>
            <h3 className="font-heebo font-bold text-lg mb-1">שיחות</h3>
            <p className="text-sm text-muted-foreground">{messagesCount} הודעות בסה"כ</p>
          </CardContent>
        </Card>

        <Card variant="elevated">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-warning/20 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-warning" />
              </div>
              <span className="text-2xl font-heebo font-bold">{recentFindings.length}</span>
            </div>
            <h3 className="font-heebo font-bold text-lg mb-1">ממצאים פעילים</h3>
            <p className="text-sm text-muted-foreground">דורשים תשומת לב</p>
          </CardContent>
        </Card>

        <Card variant="elevated">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-success/20 flex items-center justify-center">
                <Clock className="w-6 h-6 text-success" />
              </div>
              {lastMessageAt ? (
                <Badge variant="secondary">
                  {new Date(lastMessageAt).toLocaleTimeString('he-IL', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </Badge>
              ) : null}
            </div>
            <h3 className="font-heebo font-bold text-lg mb-1">סריקה אחרונה</h3>
            <p className="text-sm text-muted-foreground">
              {lastScan
                ? formatDistanceToNow(new Date(lastScan.created_at), { addSuffix: true, locale: he })
                : 'טרם בוצעה'}
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              <span className="font-medium text-foreground/80">הודעה אחרונה:</span>{' '}
              {lastMessageAt
                ? formatDistanceToNow(new Date(lastMessageAt), { addSuffix: true, locale: he })
                : 'טרם נקלטו הודעות'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Messages Feed */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-cyan-400" />
            הודעות אחרונות
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentMessages.length > 0 ? (
            <ScrollArea className="h-[300px]">
              <div className="space-y-3 pr-4">
                {recentMessages.map((msg) => (
                  <div 
                    key={msg.id} 
                    className={`glass-card p-3 flex items-start gap-3 ${
                      msg.is_child_sender ? 'border-r-2 border-r-primary' : 'border-r-2 border-r-muted'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      msg.is_child_sender ? 'bg-primary/20' : 'bg-muted'
                    }`}>
                      {msg.is_child_sender ? (
                        <User className="w-4 h-4 text-primary" />
                      ) : (
                        <Users className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-foreground/80">
                          {msg.sender_label}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {msg.chat_name}
                        </span>
                      </div>
                      <p className="text-sm text-foreground/90 line-clamp-2">
                        {(() => {
                          const content = msg.text_content || msg.text_excerpt;
                          if (msg.msg_type === 'text') {
                            return content || '[הודעה ללא תוכן טקסט]';
                          } else if (msg.msg_type === 'quote') {
                            return `↩️ ${content || '[ציטוט]'}`;
                          } else if (msg.msg_type === 'reaction') {
                            return content || '👍';
                          } else if (msg.msg_type === 'image') {
                            return `📷 ${content || 'תמונה'}`;
                          } else if (msg.msg_type === 'video') {
                            return `🎬 ${content || 'וידאו'}`;
                          } else if (msg.msg_type === 'audio' || msg.msg_type === 'ptt') {
                            return '🎤 הודעה קולית';
                          } else if (msg.msg_type === 'file' || msg.msg_type === 'document') {
                            return `📄 ${content || 'קובץ'}`;
                          } else if (msg.msg_type === 'sticker') {
                            return '🎨 סטיקר';
                          } else if (msg.msg_type === 'location') {
                            return '📍 מיקום';
                          } else if (msg.msg_type === 'contact' || msg.msg_type === 'vcard') {
                            return '👤 איש קשר';
                          } else if (msg.msg_type === 'poll') {
                            return '📊 סקר';
                          } else if (msg.msg_type === 'call_log') {
                            return '📞 שיחה';
                          } else {
                            // For unknown types, show content if available or the type itself
                            return content || `[${msg.msg_type}]`;
                          }
                        })()}
                      </p>
                      <span className="text-xs text-muted-foreground">
                        {new Date(msg.message_timestamp).toLocaleString('he-IL', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                          day: '2-digit',
                          month: '2-digit',
                        })}
                        {' • '}
                        {formatDistanceToNow(new Date(msg.message_timestamp), { 
                          addSuffix: true, 
                          locale: he 
                        })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="text-center py-8">
              <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">טרם נקלטו הודעות</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Findings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-warning" />
            ממצאים אחרונים
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentFindings.length > 0 ? (
            <div className="space-y-3">
              {recentFindings.map((finding) => (
                <div 
                  key={finding.id} 
                  className="glass-card p-4 flex items-center justify-between"
                >
                  <div className="flex-1">
                    <p className="text-sm line-clamp-2">{finding.explanation}</p>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(finding.created_at), { 
                        addSuffix: true, 
                        locale: he 
                      })}
                    </span>
                  </div>
                  {finding.risk_level && (
                    <Badge variant={
                      finding.risk_level === 'critical' ? 'riskCritical' : 
                      finding.risk_level === 'high' ? 'riskHigh' : 
                      finding.risk_level === 'medium' ? 'riskMedium' : 'riskLow'
                    }>
                      {riskLabels[finding.risk_level]}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <CheckCircle className="w-12 h-12 text-success mx-auto mb-4" />
              <p className="text-muted-foreground">לא זוהו סיכונים</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
