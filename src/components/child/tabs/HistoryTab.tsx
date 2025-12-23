import { useEffect, useState } from 'react';
import { History, Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Child, Scan, ScanStatus } from '@/types/database';
import { supabase } from '@/integrations/supabase/client';
import { format, formatDistanceToNow } from 'date-fns';
import { he } from 'date-fns/locale';

interface HistoryTabProps {
  child: Child;
}

const statusLabels: Record<ScanStatus, string> = {
  pending: 'ממתין',
  running: 'רץ',
  completed: 'הושלם',
  failed: 'נכשל',
};

const statusIcons: Record<ScanStatus, React.ReactNode> = {
  pending: <Clock className="w-4 h-4" />,
  running: <Loader2 className="w-4 h-4 animate-spin" />,
  completed: <CheckCircle className="w-4 h-4 text-success" />,
  failed: <XCircle className="w-4 h-4 text-destructive" />,
};

const lookbackLabels: Record<string, string> = {
  '24h': '24 שעות',
  '7d': '7 ימים',
  '30d': '30 ימים',
};

export function HistoryTab({ child }: HistoryTabProps) {
  const [scans, setScans] = useState<Scan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchScanHistory();
  }, [child.id]);

  async function fetchScanHistory() {
    setLoading(true);
    
    const { data } = await supabase
      .from('scans')
      .select('*')
      .eq('child_id', child.id)
      .order('created_at', { ascending: false })
      .limit(20);
    
    setScans(data || []);
    setLoading(false);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="w-5 h-5 text-primary" />
            היסטוריית סריקות
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-pulse">טוען היסטוריה...</div>
            </div>
          ) : scans.length === 0 ? (
            <div className="text-center py-12">
              <History className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="font-heebo font-bold text-xl mb-2">אין היסטוריה</h3>
              <p className="text-muted-foreground">טרם בוצעו סריקות</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">תאריך</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">טווח</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">סטטוס</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">הודעות</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">משך</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">תוצאה</th>
                  </tr>
                </thead>
                <tbody>
                  {scans.map((scan) => {
                    const summary = scan.summary_json as { threat_detected?: boolean; threat_count?: number } | null;
                    return (
                      <tr key={scan.id} className="border-b border-border/50 hover:bg-secondary/50">
                        <td className="py-3 px-4">
                          <div className="flex flex-col">
                            <span className="text-sm">
                              {format(new Date(scan.created_at), 'dd/MM/yyyy', { locale: he })}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(scan.created_at), 'HH:mm', { locale: he })}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <Badge variant="secondary">
                            {lookbackLabels[scan.lookback_window] || scan.lookback_window}
                          </Badge>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            {statusIcons[scan.status]}
                            <span className="text-sm">{statusLabels[scan.status]}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-sm">
                          {scan.messages_analyzed}
                        </td>
                        <td className="py-3 px-4 text-sm text-muted-foreground">
                          {scan.duration_seconds ? `${scan.duration_seconds} שניות` : '-'}
                        </td>
                        <td className="py-3 px-4">
                          {scan.status === 'completed' && (
                            summary?.threat_detected ? (
                              <Badge variant="riskHigh">
                                {summary.threat_count || 1} ממצאים
                              </Badge>
                            ) : (
                              <Badge variant="success">בטוח</Badge>
                            )
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
