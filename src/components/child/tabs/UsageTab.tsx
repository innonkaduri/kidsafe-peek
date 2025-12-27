import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { DollarSign, Bot, Image, AlertTriangle, TrendingUp } from "lucide-react";

interface UsageTabProps {
  child: { id: string; display_name: string };
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

export const UsageTab = ({ child }: UsageTabProps) => {
  const [usage, setUsage] = useState<UsageMeter | null>(null);
  const [loading, setLoading] = useState(true);

  const BUDGET_LIMIT = 5.00;

  useEffect(() => {
    const fetchUsage = async () => {
      const monthKey = new Date().toISOString().slice(0, 7);
      
      const { data, error } = await supabase
        .from('usage_meter')
        .select('*')
        .eq('child_id', child.id)
        .eq('month_yyyy_mm', monthKey)
        .maybeSingle();
      
      if (!error && data) {
        setUsage(data as UsageMeter);
      }
      setLoading(false);
    };

    fetchUsage();
  }, [child.id]);

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">טוען נתוני שימוש...</div>;
  }

  const costPercentage = usage ? (usage.est_cost_usd / BUDGET_LIMIT) * 100 : 0;
  const isOverBudget = costPercentage > 90;

  return (
    <div className="space-y-6" dir="rtl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            שימוש חודשי - {new Date().toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>עלות משוערת</span>
              <span className={isOverBudget ? 'text-destructive font-bold' : ''}>
                ${usage?.est_cost_usd?.toFixed(2) || '0.00'} / ${BUDGET_LIMIT.toFixed(2)}
              </span>
            </div>
            <Progress value={Math.min(costPercentage, 100)} className={isOverBudget ? 'bg-destructive/20' : ''} />
            {isOverBudget && (
              <div className="flex items-center gap-2 text-destructive text-sm">
                <AlertTriangle className="h-4 w-4" />
                קרוב לחריגה מתקציב! מופעל מצב חיסכון.
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Bot className="h-4 w-4" />
                  <span className="text-xs">Small Agent</span>
                </div>
                <div className="text-2xl font-bold">{usage?.small_calls || 0}</div>
                <div className="text-xs text-muted-foreground">קריאות (gpt-4o-mini)</div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-xs">Smart Agent</span>
                </div>
                <div className="text-2xl font-bold">{usage?.smart_calls || 0}</div>
                <div className="text-xs text-muted-foreground">קריאות (gpt-4.1-mini)</div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-xs">Fallback</span>
                </div>
                <div className="text-2xl font-bold">{usage?.fallback_calls || 0}</div>
                <div className="text-xs text-muted-foreground">קריאות (gpt-4o)</div>
                <Badge variant={usage && usage.fallback_calls >= 25 ? 'destructive' : 'secondary'} className="mt-1 text-xs">
                  מקסימום 30/חודש
                </Badge>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Image className="h-4 w-4" />
                  <span className="text-xs">Image Caption</span>
                </div>
                <div className="text-2xl font-bold">{usage?.image_caption_calls || 0}</div>
                <div className="text-xs text-muted-foreground">תמונות מתויגות</div>
              </CardContent>
            </Card>
          </div>

          {!usage && (
            <div className="text-center py-4 text-muted-foreground">
              אין נתוני שימוש לחודש הנוכחי עדיין
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
