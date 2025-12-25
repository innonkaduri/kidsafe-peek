import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowRight, User, Calendar, Tag, AlertTriangle, MessageSquare, Clock, Loader2, Send } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

interface TimelineEvent {
  action: string;
  timestamp: string;
  by?: string;
  details?: string;
}

interface TeacherAlert {
  id: string;
  child_id: string;
  parent_user_id: string;
  teacher_email: string;
  teacher_name: string | null;
  status: string;
  severity: string | null;
  category: string | null;
  parent_message: string | null;
  teacher_response: string | null;
  action_taken: string | null;
  internal_notes: string | null;
  timeline: unknown;
  created_at: string;
  responded_at: string | null;
  children?: { display_name: string; age_range: string | null } | null;
  parent_profile?: { full_name: string | null; email: string | null } | null;
}

const ACTION_OPTIONS = [
  { value: 'child_talk', label: 'שיחה עם הילד' },
  { value: 'class_talk', label: 'שיחה עם הכיתה' },
  { value: 'parent_contact', label: 'יצירת קשר עם ההורים' },
  { value: 'counselor_referral', label: 'הפניה ליועץ/ת' },
  { value: 'escalation', label: 'הסלמה להנהלה' },
  { value: 'monitoring', label: 'מעקב בלבד' },
  { value: 'other', label: 'אחר' },
];

const STATUS_OPTIONS = [
  { value: 'responded', label: 'טופל' },
  { value: 'in_progress', label: 'במעקב' },
  { value: 'needs_parent_action', label: 'נדרש המשך טיפול מההורה' },
  { value: 'escalated', label: 'הוסלם לגורם נוסף' },
];

const CATEGORY_LABELS: Record<string, string> = {
  bullying: 'חרם', profanity: 'קללות', exclusion: 'הדרה חברתית', threats: 'איומים',
  self_image: 'פגיעה בדימוי עצמי', substances: 'אלכוהול / סמים', sexual_content: 'תוכן מיני',
  violence: 'אלימות', emotional_distress: 'מצוקה רגשית',
};

const SEVERITY_CONFIG: Record<string, { label: string; className: string }> = {
  low: { label: 'נמוכה', className: 'bg-green-500/20 text-green-400 border-green-500/30' },
  medium: { label: 'בינונית', className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  high: { label: 'גבוהה', className: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  critical: { label: 'קריטית', className: 'bg-red-500/20 text-red-400 border-red-500/30' },
};

export default function TeacherTicket() {
  const { ticketId } = useParams<{ ticketId: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { activeRole } = useRole();
  
  const [alert, setAlert] = useState<TeacherAlert | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [teacherResponse, setTeacherResponse] = useState('');
  const [actionTaken, setActionTaken] = useState('');
  const [newStatus, setNewStatus] = useState('responded');
  const [internalNotes, setInternalNotes] = useState('');

  useEffect(() => {
    if (!authLoading && !user) { navigate('/auth'); return; }
    if (user && activeRole !== 'teacher') { navigate('/'); return; }
    if (user && ticketId) fetchAlert();
  }, [user, authLoading, activeRole, ticketId, navigate]);

  const fetchAlert = async () => {
    try {
      const { data, error } = await supabase
        .from('teacher_alerts')
        .select(`*, children (display_name, age_range)`)
        .eq('id', ticketId)
        .maybeSingle();

      if (error) throw error;
      if (!data) { toast({ title: 'שגיאה', description: 'הטיקט לא נמצא', variant: 'destructive' }); navigate('/teacher-portal'); return; }
      
      const { data: profile } = await supabase.from('profiles').select('full_name, email').eq('id', data.parent_user_id).maybeSingle();
      
      setAlert({ ...data, parent_profile: profile });
      setTeacherResponse(data.teacher_response || '');
      setActionTaken(data.action_taken || '');
      setInternalNotes(data.internal_notes || '');
    } catch (error) {
      console.error('Error fetching alert:', error);
      toast({ title: 'שגיאה', description: 'אירעה שגיאה בטעינת הטיקט', variant: 'destructive' });
    } finally { setLoading(false); }
  };

  const handleSubmitResponse = async () => {
    if (!alert || !teacherResponse.trim()) {
      toast({ title: 'שגיאה', description: 'יש להזין משוב להורה', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      const currentTimeline = Array.isArray(alert.timeline) ? alert.timeline : [];
      const newEvent = { action: 'teacher_response', timestamp: new Date().toISOString(), by: user?.email || 'מורה', details: `פעולה: ${ACTION_OPTIONS.find(a => a.value === actionTaken)?.label || actionTaken}` };

      const { error } = await supabase
        .from('teacher_alerts')
        .update({
          teacher_response: teacherResponse, action_taken: actionTaken, internal_notes: internalNotes,
          status: newStatus, responded_at: new Date().toISOString(), timeline: [...currentTimeline, newEvent],
        })
        .eq('id', alert.id);

      if (error) throw error;
      toast({ title: 'המשוב נשלח בהצלחה', description: 'ההורה יקבל הודעה על המשוב שלך' });
      navigate('/teacher-portal');
    } catch (error) {
      console.error('Error submitting response:', error);
      toast({ title: 'שגיאה', description: 'אירעה שגיאה בשליחת המשוב', variant: 'destructive' });
    } finally { setSubmitting(false); }
  };

  if (loading || authLoading) return <Layout><div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div></Layout>;
  if (!alert) return <Layout><div className="p-6 text-center"><p className="text-muted-foreground">הטיקט לא נמצא</p></div></Layout>;

  const timeline = Array.isArray(alert.timeline) ? (alert.timeline as TimelineEvent[]) : [];
  const severityConfig = SEVERITY_CONFIG[alert.severity || 'medium'];

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/teacher-portal')} className="rounded-xl"><ArrowRight className="w-5 h-5" /></Button>
          <div><h1 className="text-2xl font-heebo font-bold text-foreground">פרטי טיקט</h1><p className="text-sm text-muted-foreground">מזהה: {alert.id.slice(0, 8)}...</p></div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>פרטי האירוע</span>
                  <div className="flex gap-2">
                    <Badge variant="outline" className={severityConfig.className}>{severityConfig.label}</Badge>
                    <Badge variant="outline" className={alert.status === 'pending' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : alert.status === 'in_progress' ? 'bg-purple-500/20 text-purple-400 border-purple-500/30' : 'bg-green-500/20 text-green-400 border-green-500/30'}>
                      {alert.status === 'pending' ? 'פתוח' : alert.status === 'in_progress' ? 'בטיפול' : 'טופל'}
                    </Badge>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2"><User className="w-4 h-4 text-muted-foreground" /><div><p className="text-xs text-muted-foreground">שם הילד</p><p className="font-medium text-foreground">{alert.children?.display_name || 'לא ידוע'}</p></div></div>
                  <div className="flex items-center gap-2"><Calendar className="w-4 h-4 text-muted-foreground" /><div><p className="text-xs text-muted-foreground">תאריך יצירה</p><p className="font-medium text-foreground">{format(new Date(alert.created_at), 'dd/MM/yyyy HH:mm', { locale: he })}</p></div></div>
                  <div className="flex items-center gap-2"><Tag className="w-4 h-4 text-muted-foreground" /><div><p className="text-xs text-muted-foreground">קטגוריה</p><p className="font-medium text-foreground">{CATEGORY_LABELS[alert.category || ''] || 'לא מוגדר'}</p></div></div>
                  <div className="flex items-center gap-2"><MessageSquare className="w-4 h-4 text-muted-foreground" /><div><p className="text-xs text-muted-foreground">שותף ע״י</p><p className="font-medium text-foreground">{alert.parent_profile?.full_name || alert.parent_profile?.email || 'הורה'}</p></div></div>
                </div>
                <div className="pt-4 border-t border-border/50"><h4 className="text-sm font-medium text-muted-foreground mb-2">תקציר ההתראה</h4><p className="text-foreground bg-background/50 p-4 rounded-xl">{alert.parent_message || 'אין הודעה מההורה'}</p></div>
                <div className="pt-4 border-t border-border/50"><h4 className="text-sm font-medium text-muted-foreground mb-2">אינדיקטורים לסיכון</h4><div className="flex flex-wrap gap-2"><Badge variant="secondary">{CATEGORY_LABELS[alert.category || ''] || 'כללי'}</Badge>{(alert.severity === 'high' || alert.severity === 'critical') && <Badge variant="secondary" className="bg-red-500/20 text-red-400">דורש תשומת לב</Badge>}</div></div>
              </CardContent>
            </Card>

            <Card className="bg-card/50 border-border/50">
              <CardHeader><CardTitle className="flex items-center gap-2"><MessageSquare className="w-5 h-5" />משוב למורה</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div><Label htmlFor="response">משוב להורה</Label><Textarea id="response" placeholder="כתוב משוב להורה..." value={teacherResponse} onChange={(e) => setTeacherResponse(e.target.value)} className="mt-1.5 min-h-[120px] bg-background/50" /></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div><Label>פעולה שבוצעה</Label><Select value={actionTaken} onValueChange={setActionTaken}><SelectTrigger className="mt-1.5 bg-background/50"><SelectValue placeholder="בחר פעולה" /></SelectTrigger><SelectContent>{ACTION_OPTIONS.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent></Select></div>
                  <div><Label>סטטוס טיפול</Label><Select value={newStatus} onValueChange={setNewStatus}><SelectTrigger className="mt-1.5 bg-background/50"><SelectValue placeholder="בחר סטטוס" /></SelectTrigger><SelectContent>{STATUS_OPTIONS.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent></Select></div>
                </div>
                <div><Label htmlFor="notes">הערות פנימיות (לא נשלח להורה)</Label><Textarea id="notes" placeholder="הערות פנימיות..." value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} className="mt-1.5 min-h-[80px] bg-background/50" /></div>
                <Button className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white" onClick={handleSubmitResponse} disabled={submitting || !teacherResponse.trim()}>{submitting ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <Send className="w-4 h-4 ml-2" />}שלח משוב להורה וסמן כטופל</Button>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="bg-card/50 border-border/50">
              <CardHeader><CardTitle className="flex items-center gap-2"><Clock className="w-5 h-5" />ציר זמן</CardTitle></CardHeader>
              <CardContent>
                {timeline.length === 0 ? <div className="text-center py-8 text-muted-foreground"><p>אין פעולות בציר הזמן</p></div> : (
                  <div className="space-y-4">{timeline.map((event, index) => (
                    <div key={index} className="flex gap-3"><div className="flex flex-col items-center"><div className="w-2 h-2 rounded-full bg-primary" />{index < timeline.length - 1 && <div className="w-0.5 h-full bg-border mt-1" />}</div><div className="flex-1 pb-4"><p className="text-sm font-medium text-foreground">{event.action === 'teacher_response' ? 'משוב מהמורה' : event.action}</p>{event.details && <p className="text-xs text-muted-foreground mt-0.5">{event.details}</p>}<p className="text-xs text-muted-foreground mt-1">{format(new Date(event.timestamp), 'dd/MM/yyyy HH:mm', { locale: he })}{event.by && ` • ${event.by}`}</p></div></div>
                  ))}</div>
                )}
                <div className="flex gap-3 mt-4 pt-4 border-t border-border/50"><div className="flex flex-col items-center"><div className="w-2 h-2 rounded-full bg-cyan-500" /></div><div className="flex-1"><p className="text-sm font-medium text-foreground">נוצר טיקט</p><p className="text-xs text-muted-foreground mt-1">{format(new Date(alert.created_at), 'dd/MM/yyyy HH:mm', { locale: he })} • {alert.parent_profile?.full_name || 'הורה'}</p></div></div>
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-border/50"><CardContent className="p-4"><div className="flex items-start gap-3"><AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" /><div><p className="text-sm font-medium text-foreground">הודעת פרטיות</p><p className="text-xs text-muted-foreground mt-1">אין גישה לתוכן שיחות, תמונות או הקלטות.</p></div></div></CardContent></Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}
