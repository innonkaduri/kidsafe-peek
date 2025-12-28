import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Filter, Clock, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import { Layout } from '@/components/layout/Layout';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

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
  created_at: string;
  responded_at: string | null;
  children?: {
    display_name: string;
    age_range: string | null;
  } | null;
  parent_profile?: {
    full_name: string | null;
    email: string | null;
  };
}

const SEVERITY_OPTIONS = [
  { value: 'all', label: 'כל רמות החומרה' },
  { value: 'low', label: 'נמוכה' },
  { value: 'medium', label: 'בינונית' },
  { value: 'high', label: 'גבוהה' },
  { value: 'critical', label: 'קריטית' },
];

const STATUS_OPTIONS = [
  { value: 'all', label: 'כל הסטטוסים' },
  { value: 'pending', label: 'פתוח' },
  { value: 'in_progress', label: 'בטיפול' },
  { value: 'responded', label: 'טופל' },
];

const CATEGORY_OPTIONS = [
  { value: 'all', label: 'כל הקטגוריות' },
  { value: 'bullying', label: 'חרם' },
  { value: 'profanity', label: 'קללות' },
  { value: 'exclusion', label: 'הדרה חברתית' },
  { value: 'threats', label: 'איומים' },
  { value: 'self_image', label: 'פגיעה בדימוי עצמי' },
  { value: 'substances', label: 'אלכוהול / סמים' },
  { value: 'sexual_content', label: 'תוכן מיני' },
  { value: 'violence', label: 'אלימות' },
  { value: 'emotional_distress', label: 'מצוקה רגשית' },
  { value: 'harassment_bullying', label: 'הטרדה/בריונות' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'חדש לישן' },
  { value: 'oldest', label: 'ישן לחדש' },
  { value: 'severity', label: 'לפי חומרה' },
];

export default function TeacherPortal() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { activeRole } = useRole();
  const [alerts, setAlerts] = useState<TeacherAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
      return;
    }

    if (user && activeRole !== 'teacher') {
      navigate('/');
      return;
    }

    if (user) {
      fetchAlerts();
    }
  }, [user, authLoading, activeRole, navigate]);

  const fetchAlerts = async () => {
    try {
      // RLS policy filters by teacher_email automatically
      // Teachers can only see alerts sent to their email
      const { data, error } = await supabase
        .from('teacher_alerts')
        .select(`
          *,
          children (display_name, age_range)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Fetch parent profiles separately
      const alertsWithProfiles = await Promise.all(
        (data || []).map(async (alert) => {
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, email')
            .eq('id', alert.parent_user_id)
            .maybeSingle();
          return { ...alert, parent_profile: profile };
        })
      );
      
      setAlerts(alertsWithProfiles);
    } catch (error) {
      console.error('Error fetching alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredAlerts = useMemo(() => {
    let result = [...alerts];

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(alert => 
        alert.children?.display_name?.toLowerCase().includes(term) ||
        alert.parent_message?.toLowerCase().includes(term) ||
        alert.parent_profile?.full_name?.toLowerCase().includes(term)
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter(alert => alert.status === statusFilter);
    }

    // Severity filter
    if (severityFilter !== 'all') {
      result = result.filter(alert => alert.severity === severityFilter);
    }

    // Category filter
    if (categoryFilter !== 'all') {
      result = result.filter(alert => alert.category === categoryFilter);
    }

    // Sort
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    result.sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'oldest':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'severity':
          return (severityOrder[a.severity as keyof typeof severityOrder] || 3) - 
                 (severityOrder[b.severity as keyof typeof severityOrder] || 3);
        default:
          return 0;
      }
    });

    return result;
  }, [alerts, searchTerm, statusFilter, severityFilter, categoryFilter, sortBy]);

  const stats = useMemo(() => ({
    total: alerts.length,
    pending: alerts.filter(a => a.status === 'pending').length,
    inProgress: alerts.filter(a => a.status === 'in_progress').length,
    responded: alerts.filter(a => a.status === 'responded').length,
  }), [alerts]);

  const getSeverityBadge = (severity: string | null) => {
    const config = {
      low: { label: 'נמוכה', className: 'bg-green-500/20 text-green-400 border-green-500/30' },
      medium: { label: 'בינונית', className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
      high: { label: 'גבוהה', className: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
      critical: { label: 'קריטית', className: 'bg-red-500/20 text-red-400 border-red-500/30' },
    };
    const c = config[severity as keyof typeof config] || config.medium;
    return <Badge variant="outline" className={c.className}>{c.label}</Badge>;
  };

  const getStatusBadge = (status: string) => {
    const config = {
      pending: { label: 'פתוח', className: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
      in_progress: { label: 'בטיפול', className: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
      responded: { label: 'טופל', className: 'bg-green-500/20 text-green-400 border-green-500/30' },
    };
    const c = config[status as keyof typeof config] || config.pending;
    return <Badge variant="outline" className={c.className}>{c.label}</Badge>;
  };

  const getCategoryLabel = (category: string | null) => {
    const cat = CATEGORY_OPTIONS.find(c => c.value === category);
    return cat?.label || category || 'לא מוגדר';
  };

  if (loading || authLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-heebo font-bold text-foreground">דשבורד מורים</h1>
          <p className="text-muted-foreground mt-1">התראות שנשלחו אליך מהורים</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                  <Filter className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{stats.total}</p>
                  <p className="text-xs text-muted-foreground">סה״כ התראות</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-yellow-500/20 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-yellow-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{stats.pending}</p>
                  <p className="text-xs text-muted-foreground">פתוחות</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{stats.inProgress}</p>
                  <p className="text-xs text-muted-foreground">בטיפול</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{stats.responded}</p>
                  <p className="text-xs text-muted-foreground">טופלו</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="relative md:col-span-2">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="חיפוש לפי שם ילד, הורה או תוכן..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pr-10 bg-background/50"
                />
              </div>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="bg-background/50">
                  <SelectValue placeholder="סטטוס" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={severityFilter} onValueChange={setSeverityFilter}>
                <SelectTrigger className="bg-background/50">
                  <SelectValue placeholder="חומרה" />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITY_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="bg-background/50">
                  <SelectValue placeholder="מיון" />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="mt-3">
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="bg-background/50 w-full md:w-auto">
                  <SelectValue placeholder="קטגוריה" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Tickets List */}
        <div className="space-y-3">
          {filteredAlerts.length === 0 ? (
            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-8 text-center">
                <p className="text-muted-foreground">לא נמצאו התראות</p>
                <p className="text-sm text-muted-foreground mt-2">התראות שיישלחו אליך מהורים יופיעו כאן</p>
              </CardContent>
            </Card>
          ) : (
            filteredAlerts.map((alert) => (
              <Card 
                key={alert.id}
                className="bg-card/50 border-border/50 hover:border-primary/30 transition-all cursor-pointer"
                onClick={() => navigate(`/teacher-ticket/${alert.id}`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-foreground">
                          {alert.children?.display_name || 'ילד לא ידוע'}
                        </span>
                        {alert.children?.age_range && (
                          <span className="text-xs text-muted-foreground">
                            ({alert.children.age_range})
                          </span>
                        )}
                        {getStatusBadge(alert.status)}
                        {getSeverityBadge(alert.severity)}
                      </div>
                      
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {alert.parent_message || 'אין הודעה מההורה'}
                      </p>
                      
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>קטגוריה: {getCategoryLabel(alert.category)}</span>
                        <span>•</span>
                        <span>שותף ע״י: {alert.parent_profile?.full_name || alert.parent_profile?.email || 'הורה'}</span>
                        <span>•</span>
                        <span>{format(new Date(alert.created_at), 'dd/MM/yyyy HH:mm', { locale: he })}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </Layout>
  );
}
