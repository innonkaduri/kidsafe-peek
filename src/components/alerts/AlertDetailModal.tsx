import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
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
  X
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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
}

interface AlertDetailModalProps {
  finding: Finding | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: () => void;
}

export function AlertDetailModal({ finding, open, onOpenChange, onUpdate }: AlertDetailModalProps) {
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
          threat_detected: false // Mark as handled
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

          <Separator className="bg-border" />

          {/* Notes Section */}
          <div className="space-y-3">
            <h4 className="font-heebo font-semibold text-foreground">הערות לטיפול</h4>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="הוסף הערות על אופן הטיפול באירוע..."
              className="min-h-[100px] bg-input border-border resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-4">
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
