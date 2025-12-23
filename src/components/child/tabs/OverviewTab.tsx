import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Shield, 
  MessageSquare, 
  AlertTriangle, 
  CheckCircle,
  Clock,
  TrendingUp
} from 'lucide-react';
import { Child, Scan, Finding, Chat, RiskLevel } from '@/types/database';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { he } from 'date-fns/locale';

interface OverviewTabProps {
  child: Child;
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
  const [chatsCount, setChatsCount] = useState(0);
  const [messagesCount, setMessagesCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchOverviewData() {
      setLoading(true);
      
      // Fetch last scan
      const { data: scanData } = await supabase
        .from('scans')
        .select('*')
        .eq('child_id', child.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      setLastScan(scanData);

      // Fetch recent findings
      const { data: findingsData } = await supabase
        .from('findings')
        .select('*')
        .eq('child_id', child.id)
        .eq('threat_detected', true)
        .order('created_at', { ascending: false })
        .limit(5);
      
      setRecentFindings(findingsData || []);

      // Fetch chats count
      const { count: chats } = await supabase
        .from('chats')
        .select('*', { count: 'exact', head: true })
        .eq('child_id', child.id);
      
      setChatsCount(chats || 0);

      // Fetch messages count
      const { count: messages } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('child_id', child.id);
      
      setMessagesCount(messages || 0);

      setLoading(false);
    }

    fetchOverviewData();
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
            </div>
            <h3 className="font-heebo font-bold text-lg mb-1">סריקה אחרונה</h3>
            <p className="text-sm text-muted-foreground">
              {lastScan ? formatDistanceToNow(new Date(lastScan.created_at), { 
                addSuffix: true, 
                locale: he 
              }) : 'טרם בוצעה'}
            </p>
          </CardContent>
        </Card>
      </div>

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
