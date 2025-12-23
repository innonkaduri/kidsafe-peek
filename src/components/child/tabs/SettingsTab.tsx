import { useState } from 'react';
import { Settings, Shield, Trash2, User } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Child, AgeRange } from '@/types/database';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

interface SettingsTabProps {
  child: Child;
  onUpdate: () => void;
}

export function SettingsTab({ child, onUpdate }: SettingsTabProps) {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState(child.display_name);
  const [ageRange, setAgeRange] = useState<AgeRange | ''>(child.age_range || '');
  const [monitoringEnabled, setMonitoringEnabled] = useState(child.monitoring_enabled);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    
    try {
      const { error } = await supabase
        .from('children')
        .update({
          display_name: displayName.trim(),
          age_range: ageRange || null,
          monitoring_enabled: monitoringEnabled,
        })
        .eq('id', child.id);

      if (error) throw error;

      toast.success('ההגדרות נשמרו בהצלחה');
      onUpdate();
    } catch (error: any) {
      toast.error('שגיאה בשמירה: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      const { error } = await supabase
        .from('children')
        .delete()
        .eq('id', child.id);

      if (error) throw error;

      toast.success('הפרופיל נמחק');
      navigate('/');
    } catch (error: any) {
      toast.error('שגיאה במחיקה: ' + error.message);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5 text-primary" />
            פרטי פרופיל
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="displayName">שם תצוגה</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ageRange">טווח גילאים</Label>
            <Select value={ageRange} onValueChange={(v) => setAgeRange(v as AgeRange)}>
              <SelectTrigger>
                <SelectValue placeholder="בחרו טווח גילאים" />
              </SelectTrigger>
              <SelectContent className="glass-card border-border">
                <SelectItem value="6-9">6-9 שנים</SelectItem>
                <SelectItem value="10-12">10-12 שנים</SelectItem>
                <SelectItem value="13-15">13-15 שנים</SelectItem>
                <SelectItem value="16-18">16-18 שנים</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button onClick={handleSave} variant="glow" disabled={saving}>
            {saving ? 'שומר...' : 'שמור שינויים'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            הגדרות ניטור
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>ניטור פעיל</Label>
              <p className="text-sm text-muted-foreground">
                הפעלה/השבתה של ניטור הודעות
              </p>
            </div>
            <Switch
              checked={monitoringEnabled}
              onCheckedChange={setMonitoringEnabled}
            />
          </div>

          {child.consent_ack_at && (
            <div className="glass-card p-4 rounded-xl">
              <p className="text-sm text-success flex items-center gap-2">
                <Shield className="w-4 h-4" />
                הסכמה אושרה: {new Date(child.consent_ack_at).toLocaleDateString('he-IL')}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="w-5 h-5" />
            אזור מסוכן
          </CardTitle>
          <CardDescription>
            פעולות בלתי הפיכות
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="danger">
                <Trash2 className="w-4 h-4" />
                מחיקת פרופיל
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="glass-card border-border">
              <AlertDialogHeader>
                <AlertDialogTitle>האם למחוק את הפרופיל?</AlertDialogTitle>
                <AlertDialogDescription>
                  פעולה זו תמחק את כל הנתונים של {child.display_name} לצמיתות, 
                  כולל שיחות, סריקות וממצאים. לא ניתן לשחזר את הנתונים לאחר המחיקה.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>ביטול</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  מחק לצמיתות
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}
