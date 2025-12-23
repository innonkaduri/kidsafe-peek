import { User, Shield, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { Child, Scan, RiskLevel } from '@/types/database';
import { formatDistanceToNow } from 'date-fns';
import { he } from 'date-fns/locale';

interface ChildCardProps {
  child: Child;
  lastScan?: Scan | null;
  findingsCount?: number;
}

const riskBadgeVariant: Record<RiskLevel, 'riskLow' | 'riskMedium' | 'riskHigh' | 'riskCritical'> = {
  low: 'riskLow',
  medium: 'riskMedium',
  high: 'riskHigh',
  critical: 'riskCritical',
};

const riskLabels: Record<RiskLevel, string> = {
  low: 'נמוך',
  medium: 'בינוני',
  high: 'גבוה',
  critical: 'קריטי',
};

const ageRangeLabels: Record<string, string> = {
  '6-9': 'גילאי 6-9',
  '10-12': 'גילאי 10-12',
  '13-15': 'גילאי 13-15',
  '16-18': 'גילאי 16-18',
};

export function ChildCard({ child, lastScan, findingsCount = 0 }: ChildCardProps) {
  const lastScanRisk = lastScan?.summary_json?.risk_level as RiskLevel | undefined;
  const hasThreats = lastScan?.summary_json?.threat_detected;

  return (
    <Card variant="elevated" className="group">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-cyan-500/20 flex items-center justify-center border border-primary/20">
              {child.avatar_url ? (
                <img 
                  src={child.avatar_url} 
                  alt={child.display_name} 
                  className="w-full h-full rounded-2xl object-cover"
                />
              ) : (
                <User className="w-7 h-7 text-primary" />
              )}
            </div>
            <div>
              <h3 className="font-heebo font-bold text-lg">{child.display_name}</h3>
              {child.age_range && (
                <span className="text-sm text-muted-foreground">
                  {ageRangeLabels[child.age_range]}
                </span>
              )}
            </div>
          </div>
          
          {child.monitoring_enabled && (
            <div className="monitoring-indicator">
              <span>ניטור פעיל</span>
            </div>
          )}
        </div>

        <div className="space-y-3 mb-4">
          {lastScan ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="w-4 h-4" />
                <span>
                  סריקה אחרונה: {formatDistanceToNow(new Date(lastScan.created_at), { 
                    addSuffix: true, 
                    locale: he 
                  })}
                </span>
              </div>
              {lastScanRisk && hasThreats && (
                <Badge variant={riskBadgeVariant[lastScanRisk]}>
                  {riskLabels[lastScanRisk]}
                </Badge>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="w-4 h-4" />
              <span>טרם בוצעה סריקה</span>
            </div>
          )}

          <div className="flex items-center gap-4">
            {hasThreats ? (
              <div className="flex items-center gap-2 text-risk-high">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-sm">{findingsCount} ממצאים דורשים תשומת לב</span>
              </div>
            ) : lastScan ? (
              <div className="flex items-center gap-2 text-success">
                <CheckCircle className="w-4 h-4" />
                <span className="text-sm">לא זוהו סיכונים</span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex gap-2">
          <Button asChild variant="glow" className="flex-1">
            <Link to={`/child/${child.id}`}>
              <Shield className="w-4 h-4" />
              צפייה בפרופיל
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
