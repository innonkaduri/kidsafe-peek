import { useState } from 'react';
import { GraduationCap, Shield, Trash2, User } from 'lucide-react';
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
  const [teacherEmail, setTeacherEmail] = useState(child.teacher_email || '');
  const [saving, setSaving] = useState(false);
  const [savingTeacher, setSavingTeacher] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  const handleSaveTeacher = async () => {
    // Validate email format
    if (teacherEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(teacherEmail)) {
      toast.error('כתובת מייל לא תקינה');
      return;
    }

    setSavingTeacher(true);
    
    try {
      const { error } = await supabase
        .from('children')
        .update({
          teacher_email: teacherEmail.trim() || null,
        })
        .eq('id', child.id);

      if (error) throw error;

      toast.success('מייל המורה נשמר בהצלחה');
      onUpdate();
    } catch (error: any) {
      toast.error('שגיאה בשמירה: ' + error.message);
    } finally {
      setSavingTeacher(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      // First, delete the WhatsApp instance if exists
      try {
        await supabase.functions.invoke('green-api-partner', {
          body: { action: 'deleteInstance', child_id: child.id },
        });
      } catch (instanceError) {
        console.log('Instance deletion skipped or failed:', instanceError);
      }

      // Then delete the child profile
      const { error } = await supabase
        .from('children')
        .delete()
        .eq('id', child.id);

      if (error) throw error;

      toast.success('הפרופיל והחיבור נמחקו');
      navigate('/');
    } catch (error: any) {
      toast.error('שגיאה במחיקה: ' + error.message);
      setDeleting(false);
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-primary" />
            שיתוף עם מורה
          </CardTitle>
          <CardDescription>
            הזינו את כתובת המייל של המורה/יועץ לקבלת התראות על ממצאים
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="teacherEmail">כתובת מייל של המורה</Label>
            <Input
              id="teacherEmail"
              type="email"
              placeholder="teacher@school.edu"
              value={teacherEmail}
              onChange={(e) => setTeacherEmail(e.target.value)}
              dir="ltr"
              className="text-left"
            />
            <p className="text-xs text-muted-foreground">
              כאשר תבחרו לשתף ממצא עם המורה, הוא יישלח לכתובת זו
            </p>
          </div>

          <Button onClick={handleSaveTeacher} variant="glow" disabled={savingTeacher}>
            {savingTeacher ? 'שומר...' : 'שמור מייל מורה'}
          </Button>
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
              <Button variant="danger" disabled={deleting}>
                <Trash2 className="w-4 h-4" />
                {deleting ? 'מוחק...' : 'מחיקת פרופיל'}
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
