import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { 
  Bot, 
  Brain, 
  Image, 
  AlertTriangle, 
  Clock, 
  CheckCircle, 
  XCircle,
  DollarSign,
  Activity,
  Zap,
  TrendingUp
} from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";

interface AgentMonitorTabProps {
  child: { id: string; display_name: string };
}

interface ModelLog {
  id: string;
  function_name: string;
  model: string;
  request_tokens: number;
  response_tokens: number;
  latency_ms: number;
  success: boolean;
  error_message: string | null;
  created_at: string;
}

interface SmallSignal {
  id: string;
  message_id: string;
  risk_score: number;
  risk_codes: string[];
  escalate: boolean;
  created_at: string;
}

interface SmartDecision {
  id: string;
  chat_id: string;
  final_risk_score: number;
  threat_type: string;
  confidence: number;
  action: string;
  key_reasons: string[];
  created_at: string;
}

interface UsageMeter {
  id: string;
  month_yyyy_mm: string;
  est_cost_usd: number;
  small_calls: number;
  smart_calls: number;
  fallback_calls: number;
  image_caption_calls: number;
}

interface ScanCheckpoint {
  id: string;
  chat_id: string;
  last_scanned_at: string;
  last_smart_at: string;
  last_activity_at: string;
  scan_interval_minutes: number;
}

export const AgentMonitorTab = ({ child }: AgentMonitorTabProps) => {
  const [logs, setLogs] = useState<ModelLog[]>([]);
  const [signals, setSignals] = useState<SmallSignal[]>([]);
  const [decisions, setDecisions] = useState<SmartDecision[]>([]);
  const [usage, setUsage] = useState<UsageMeter | null>(null);
  const [checkpoints, setCheckpoints] = useState<ScanCheckpoint[]>([]);
  const [loading, setLoading] = useState(true);

  const BUDGET_LIMIT = 5.00;

  useEffect(() => {
    fetchAllData();
  }, [child.id]);

  const fetchAllData = async () => {
    setLoading(true);
    
    // Fetch model logs
    const { data: logsData } = await supabase
      .from('model_logs')
      .select('*')
      .eq('child_id', child.id)
      .order('created_at', { ascending: false })
      .limit(100);
    
    if (logsData) setLogs(logsData as ModelLog[]);

    // Fetch small signals via messages
    const { data: messagesData } = await supabase
      .from('messages')
      .select('id')
      .eq('child_id', child.id);
    
    if (messagesData && messagesData.length > 0) {
      const messageIds = messagesData.map(m => m.id);
      const { data: signalsData } = await supabase
        .from('small_signals')
        .select('*')
        .in('message_id', messageIds)
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (signalsData) setSignals(signalsData as SmallSignal[]);
    }

    // Fetch smart decisions
    const { data: decisionsData } = await supabase
      .from('smart_decisions')
      .select('*')
      .eq('child_id', child.id)
      .order('created_at', { ascending: false })
      .limit(50);
    
    if (decisionsData) setDecisions(decisionsData as SmartDecision[]);

    // Fetch usage meter
    const monthKey = new Date().toISOString().slice(0, 7);
    const { data: usageData } = await supabase
      .from('usage_meter')
      .select('*')
      .eq('child_id', child.id)
      .eq('month_yyyy_mm', monthKey)
      .maybeSingle();
    
    if (usageData) setUsage(usageData as UsageMeter);

    // Fetch scan checkpoints via chats
    const { data: chatsData } = await supabase
      .from('chats')
      .select('id')
      .eq('child_id', child.id);
    
    if (chatsData && chatsData.length > 0) {
      const chatIds = chatsData.map(c => c.id);
      const { data: checkpointsData } = await supabase
        .from('scan_checkpoints')
        .select('*')
        .in('chat_id', chatIds);
      
      if (checkpointsData) setCheckpoints(checkpointsData as ScanCheckpoint[]);
    }

    setLoading(false);
  };

  const getModelIcon = (functionName: string) => {
    if (functionName.includes('small')) return <Bot className="h-4 w-4 text-blue-500" />;
    if (functionName.includes('smart')) return <Brain className="h-4 w-4 text-purple-500" />;
    if (functionName.includes('caption') || functionName.includes('image')) return <Image className="h-4 w-4 text-green-500" />;
    return <Zap className="h-4 w-4 text-yellow-500" />;
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'alert':
        return <Badge variant="destructive">התראה</Badge>;
      case 'monitor':
        return <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-700">מעקב</Badge>;
      default:
        return <Badge variant="outline">התעלם</Badge>;
    }
  };

  const getRiskBadge = (score: number) => {
    if (score >= 70) return <Badge variant="destructive">{score}</Badge>;
    if (score >= 40) return <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-700">{score}</Badge>;
    return <Badge variant="outline">{score}</Badge>;
  };

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">טוען נתוני ניטור...</div>;
  }

  const costPercentage = usage ? (usage.est_cost_usd / BUDGET_LIMIT) * 100 : 0;
  const totalCalls = usage ? (usage.small_calls + usage.smart_calls + usage.fallback_calls + usage.image_caption_calls) : 0;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <DollarSign className="h-4 w-4" />
              <span className="text-xs">עלות חודשית</span>
            </div>
            <div className="text-2xl font-bold">${usage?.est_cost_usd?.toFixed(2) || '0.00'}</div>
            <Progress value={Math.min(costPercentage, 100)} className="mt-2 h-1" />
            <div className="text-xs text-muted-foreground mt-1">{costPercentage.toFixed(0)}% מתקציב</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Activity className="h-4 w-4" />
              <span className="text-xs">קריאות AI</span>
            </div>
            <div className="text-2xl font-bold">{totalCalls}</div>
            <div className="text-xs text-muted-foreground mt-1">החודש</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-xs">סיגנלים</span>
            </div>
            <div className="text-2xl font-bold">{signals.length}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {signals.filter(s => s.escalate).length} להסלמה
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Brain className="h-4 w-4" />
              <span className="text-xs">החלטות Smart</span>
            </div>
            <div className="text-2xl font-bold">{decisions.length}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {decisions.filter(d => d.action === 'alert').length} התראות
            </div>
          </CardContent>
        </Card>
      </div>

      {/* API Calls Breakdown */}
      {usage && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              פירוט קריאות API
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-blue-500" />
                  <span className="text-sm font-medium">Small Agent</span>
                </div>
                <div className="text-2xl font-bold">{usage.small_calls}</div>
                <div className="text-xs text-muted-foreground">gpt-4o-mini</div>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Brain className="h-4 w-4 text-purple-500" />
                  <span className="text-sm font-medium">Smart Agent</span>
                </div>
                <div className="text-2xl font-bold">{usage.smart_calls}</div>
                <div className="text-xs text-muted-foreground">gpt-4.1-mini</div>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  <span className="text-sm font-medium">Fallback</span>
                </div>
                <div className="text-2xl font-bold">{usage.fallback_calls}</div>
                <div className="text-xs text-muted-foreground">gpt-4o (מקס 30)</div>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Image className="h-4 w-4 text-green-500" />
                  <span className="text-sm font-medium">Image Caption</span>
                </div>
                <div className="text-2xl font-bold">{usage.image_caption_calls}</div>
                <div className="text-xs text-muted-foreground">gpt-4.1-mini</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detailed Tabs */}
      <Tabs defaultValue="logs" className="w-full">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="logs" className="gap-2">
            <Clock className="h-4 w-4" />
            לוגים ({logs.length})
          </TabsTrigger>
          <TabsTrigger value="signals" className="gap-2">
            <Zap className="h-4 w-4" />
            סיגנלים ({signals.length})
          </TabsTrigger>
          <TabsTrigger value="decisions" className="gap-2">
            <Brain className="h-4 w-4" />
            החלטות ({decisions.length})
          </TabsTrigger>
          <TabsTrigger value="checkpoints" className="gap-2">
            <Activity className="h-4 w-4" />
            Checkpoints ({checkpoints.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="logs" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">לוג קריאות AI</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <div className="space-y-2">
                  {logs.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">אין לוגים עדיין</div>
                  ) : (
                    logs.map((log) => (
                      <div key={log.id} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                        <div className="flex items-center gap-3">
                          {getModelIcon(log.function_name)}
                          <div>
                            <div className="font-medium text-sm">{log.function_name}</div>
                            <div className="text-xs text-muted-foreground">{log.model}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-xs">
                          <div className="text-muted-foreground">
                            <span className="font-mono">{log.request_tokens}</span> → <span className="font-mono">{log.response_tokens}</span> tokens
                          </div>
                          <div className="text-muted-foreground">
                            {log.latency_ms}ms
                          </div>
                          {log.success ? (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-500" />
                          )}
                          <div className="text-muted-foreground w-24">
                            {format(new Date(log.created_at), 'HH:mm:ss', { locale: he })}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="signals" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">סיגנלים מ-Small Agent</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <div className="space-y-2">
                  {signals.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">אין סיגנלים עדיין</div>
                  ) : (
                    signals.map((signal) => (
                      <div key={signal.id} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                        <div className="flex items-center gap-3">
                          {getRiskBadge(signal.risk_score)}
                          <div className="flex flex-wrap gap-1">
                            {signal.risk_codes.map((code, i) => (
                              <Badge key={i} variant="outline" className="text-xs">{code}</Badge>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {signal.escalate && (
                            <Badge variant="destructive" className="text-xs">הסלמה</Badge>
                          )}
                          <div className="text-xs text-muted-foreground">
                            {format(new Date(signal.created_at), 'dd/MM HH:mm', { locale: he })}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="decisions" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">החלטות Smart Agent</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <div className="space-y-2">
                  {decisions.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">אין החלטות עדיין</div>
                  ) : (
                    decisions.map((decision) => (
                      <div key={decision.id} className="p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {getRiskBadge(decision.final_risk_score)}
                            {getActionBadge(decision.action)}
                            <Badge variant="outline" className="text-xs">
                              {(decision.confidence * 100).toFixed(0)}% confidence
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {format(new Date(decision.created_at), 'dd/MM HH:mm', { locale: he })}
                          </div>
                        </div>
                        {decision.threat_type !== 'none' && (
                          <div className="text-sm mb-1">
                            <span className="text-muted-foreground">סוג איום:</span> {decision.threat_type}
                          </div>
                        )}
                        {decision.key_reasons.length > 0 && (
                          <div className="text-xs text-muted-foreground">
                            {decision.key_reasons.join(' • ')}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="checkpoints" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">נקודות ביקורת סריקה</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <div className="space-y-2">
                  {checkpoints.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">אין checkpoints עדיין</div>
                  ) : (
                    checkpoints.map((cp) => (
                      <div key={cp.id} className="p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                        <div className="flex items-center justify-between mb-2">
                          <div className="font-mono text-xs">{cp.chat_id.slice(0, 8)}...</div>
                          <Badge variant="outline">{cp.scan_interval_minutes || 10} דקות</Badge>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div>
                            <span className="text-muted-foreground">סריקה אחרונה:</span>
                            <div>{cp.last_scanned_at ? format(new Date(cp.last_scanned_at), 'HH:mm:ss', { locale: he }) : '-'}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Smart אחרון:</span>
                            <div>{cp.last_smart_at ? format(new Date(cp.last_smart_at), 'HH:mm:ss', { locale: he }) : '-'}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">פעילות:</span>
                            <div>{cp.last_activity_at ? format(new Date(cp.last_activity_at), 'HH:mm:ss', { locale: he }) : '-'}</div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
