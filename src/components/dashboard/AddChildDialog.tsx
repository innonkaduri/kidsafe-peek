import { useState } from 'react';
import { Plus, User, CheckCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { AgeRange } from '@/types/database';

interface AddChildDialogProps {
  onChildAdded: () => void;
}

export function AddChildDialog({ onChildAdded }: AddChildDialogProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [ageRange, setAgeRange] = useState<AgeRange | ''>('');
  const [consentAck, setConsentAck] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      toast.error('יש להתחבר תחילה');
      return;
    }

    if (!displayName.trim()) {
      toast.error('נא להזין שם תצוגה');
      return;
    }

    if (!consentAck) {
      toast.error('יש לאשר את הסכמת הילד/ה לניטור');
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.from('children').insert({
        user_id: user.id,
        display_name: displayName.trim(),
        age_range: ageRange || null,
        consent_ack_at: new Date().toISOString(),
        monitoring_enabled: true,
      });

      if (error) throw error;

      toast.success('הפרופיל נוצר בהצלחה');
      setOpen(false);
      setDisplayName('');
      setAgeRange('');
      setConsentAck(false);
      onChildAdded();
    } catch (error: any) {
      toast.error('שגיאה ביצירת הפרופיל: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="glow" size="lg" className="gap-2">
          <Plus className="w-5 h-5" />
          הוספת ילד/ה
        </Button>
      </DialogTrigger>
      <DialogContent className="glass-card border-border sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heebo text-xl">הוספת פרופיל ילד/ה</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            צרו פרופיל חדש לניטור בטיחות
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="displayName">שם תצוגה</Label>
            <div className="relative">
              <User className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="הזינו שם או כינוי"
                className="pr-10"
              />
            </div>
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

          <div className="glass-card p-4 rounded-xl space-y-3">
            <div className="flex items-start gap-3">
              <Checkbox
                id="consent"
                checked={consentAck}
                onCheckedChange={(checked) => setConsentAck(checked as boolean)}
              />
              <div className="space-y-1">
                <Label htmlFor="consent" className="text-sm font-medium cursor-pointer">
                  אישור הסכמה
                </Label>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  אני מאשר/ת שהילד/ה מודע/ת לניטור ההודעות ומסכים/ה לכך. 
                  הניטור נעשה למטרות בטיחות בלבד.
                </p>
              </div>
            </div>
          </div>

          <Button type="submit" variant="glow" className="w-full" disabled={loading}>
            {loading ? (
              <span className="animate-pulse">יוצר פרופיל...</span>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                יצירת פרופיל
              </>
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
