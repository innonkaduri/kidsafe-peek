import { useEffect, useState } from 'react';
import { AlertTriangle, MessageSquare, Image, Mic, Calendar, Filter, Eye, CheckCircle } from 'lucide-react';
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

interface FindingsTabProps {
  child: Child;
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

export function FindingsTab({ child }: FindingsTabProps) {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [contextDialogOpen, setContextDialogOpen] = useState(false);

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
    
    if (!error) {
      setFindings(data || []);
    }
    
    setLoading(false);
  }

  const openContextDialog = (finding: Finding) => {
    setSelectedFinding(finding);
    setContextDialogOpen(true);
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
          {findings.map((finding) => (
            <Card 
              key={finding.id} 
              variant="risk"
              className={`${finding.risk_level ? getRiskBorderColor(finding.risk_level) : ''}`}
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-warning/20 flex items-center justify-center">
                      <AlertTriangle className="w-5 h-5 text-warning" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        {finding.risk_level && (
                          <Badge variant={
                            finding.risk_level === 'critical' ? 'riskCritical' :
                            finding.risk_level === 'high' ? 'riskHigh' :
                            finding.risk_level === 'medium' ? 'riskMedium' : 'riskLow'
                          }>
                            {riskLabels[finding.risk_level]}
                          </Badge>
                        )}
                        {(finding.threat_types as ThreatType[])?.map((type) => (
                          <Badge key={type} variant="outline">
                            {threatTypeLabels[type] || type}
                          </Badge>
                        ))}
                      </div>
                      <span className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <Calendar className="w-3 h-3" />
                        {format(new Date(finding.created_at), 'dd/MM/yyyy HH:mm', { locale: he })}
                      </span>
                    </div>
                  </div>
                </div>

                <p className="text-sm mb-4 leading-relaxed">{finding.explanation}</p>

                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => openContextDialog(finding)}
                  >
                    <Eye className="w-4 h-4" />
                    הצג הקשר
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
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
                  <div className="text-sm p-3 rounded-lg bg-secondary/50">
                    <span className="text-muted-foreground text-xs">זר • לפני 2 שעות</span>
                    <p>היי יפה/יפה, רוצה להכיר?</p>
                  </div>
                  <div className="text-sm p-3 rounded-lg bg-primary/10 mr-8">
                    <span className="text-muted-foreground text-xs">הילד/ה • לפני שעה</span>
                    <p>מי זה?</p>
                  </div>
                  <div className="text-sm p-3 rounded-lg bg-destructive/10 border border-destructive/30">
                    <span className="text-muted-foreground text-xs">זר • לפני 30 דקות</span>
                    <p>לא משנה, תשלחי תמונה?</p>
                    <Badge variant="riskHigh" className="mt-2">ממצא</Badge>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
