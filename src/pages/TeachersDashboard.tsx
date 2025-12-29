import { useState, useEffect, useCallback } from 'react';
import { Shield, AlertTriangle, Clock, CheckCircle, Search } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

interface TeacherAlert {
  id: string;
  child_id: string;
  teacher_email: string;
  teacher_name: string | null;
  status: string;
  parent_message: string | null;
  teacher_response: string | null;
  created_at: string;
  responded_at: string | null;
  child_name?: string;
  severity?: string | null;
  category?: string | null;
}

interface ChildWithStatus {
  id: string;
  display_name: string;
  age_range: string | null;
  findings_count: number;
  alerts_sent: number;
}

export default function TeachersDashboard() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [teacherAlerts, setTeacherAlerts] = useState<TeacherAlert[]>([]);
  const [childrenWithStatus, setChildrenWithStatus] = useState<ChildWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const fetchData = useCallback(async () => {
    if (!user?.email) return;

    setLoading(true);

    // Fetch alerts where this user is the teacher (by email)
    // Important: filter by teacher_email to show only alerts sent TO this teacher
    // not alerts created BY this user as a parent
    const { data: alertsData, error } = await supabase
      .from('teacher_alerts')
      .select('*')
      .eq('teacher_email', user.email)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching teacher alerts:', error);
      setLoading(false);
      return;
    }

    if (alertsData && alertsData.length > 0) {
      // Fetch child names for the alerts
      const childIds = [...new Set(alertsData.map(a => a.child_id))];
      const { data: childrenData } = await supabase
        .from('children')
        .select('id, display_name, age_range')
        .in('id', childIds);

      const alertsWithNames = alertsData.map(a => ({
        ...a,
        child_name: childrenData?.find(c => c.id === a.child_id)?.display_name || 'תלמיד'
      }));
      
      setTeacherAlerts(alertsWithNames);

      // Build children with status from alerts data
      const childrenWithCounts: ChildWithStatus[] = childrenData?.map(child => ({
        ...child,
        findings_count: 0,
        alerts_sent: alertsData.filter(a => a.child_id === child.id).length
      })) || [];

      setChildrenWithStatus(childrenWithCounts);
    } else {
      setTeacherAlerts([]);
      setChildrenWithStatus([]);
    }

    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
      return;
    }

    fetchData();
  }, [user, authLoading, navigate, fetchData]);

  // Real-time subscription for new alerts
  useEffect(() => {
    if (!user?.email) return;

    const channel = supabase
      .channel('teacher-alerts-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'teacher_alerts'
        },
        async (payload) => {
          // Fetch child name for the new alert
          const newAlert = payload.new as TeacherAlert;
          const { data: childData } = await supabase
            .from('children')
            .select('display_name')
            .eq('id', newAlert.child_id)
            .maybeSingle();

          const alertWithName = {
            ...newAlert,
            child_name: childData?.display_name || 'תלמיד'
          };

          setTeacherAlerts(prev => [alertWithName, ...prev]);
          toast.info(`התקבלה התראה חדשה על ${alertWithName.child_name}`, {
            duration: 5000,
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'teacher_alerts'
        },
        (payload) => {
          const updatedAlert = payload.new as TeacherAlert;
          setTeacherAlerts(prev => 
            prev.map(a => a.id === updatedAlert.id ? { ...a, ...updatedAlert } : a)
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.email]);

  // Calculate stats
  const totalAlerts = teacherAlerts.length;
  const pendingAlerts = teacherAlerts.filter(a => a.status === 'pending').length;
  const respondedAlerts = teacherAlerts.filter(a => a.status === 'responded').length;

  // Filter alerts
  const filteredAlerts = teacherAlerts.filter(alert => {
    const matchesSearch = searchQuery === '' || 
      alert.child_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      alert.parent_message?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || alert.status === statusFilter;
    const matchesCategory = categoryFilter === 'all' || alert.category === categoryFilter;
    
    return matchesSearch && matchesStatus && matchesCategory;
  });

  // Get unique categories
  const categories = [...new Set(teacherAlerts.map(a => a.category).filter(Boolean))];

  if (authLoading || loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <Shield className="w-16 h-16 mx-auto mb-4 text-primary animate-pulse" />
            <p className="text-muted-foreground">טוען...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6 animate-slide-up">
        {/* Stats Cards - Like reference image */}
        <div className="space-y-4">
          {/* Total Alerts Card */}
          <Card className="glass-card border-0">
            <CardContent className="p-5 flex items-center justify-between">
              <div className="flex flex-col items-end flex-1">
                <span className="text-4xl font-heebo font-bold text-foreground">{totalAlerts}</span>
                <p className="text-sm text-muted-foreground mt-1">סך הכל התראות</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-violet-500/20 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-violet-400" />
              </div>
            </CardContent>
          </Card>

          {/* Pending Alerts Card */}
          <Card className="glass-card border-0">
            <CardContent className="p-5 flex items-center justify-between">
              <div className="flex flex-col items-end flex-1">
                <span className="text-4xl font-heebo font-bold text-foreground">{pendingAlerts}</span>
                <p className="text-sm text-muted-foreground mt-1">ממתינות לטיפול</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center">
                <Clock className="w-6 h-6 text-amber-400" />
              </div>
            </CardContent>
          </Card>

          {/* Handled Alerts Card */}
          <Card className="glass-card border-0">
            <CardContent className="p-5 flex items-center justify-between">
              <div className="flex flex-col items-end flex-1">
                <span className="text-4xl font-heebo font-bold text-foreground">{respondedAlerts}</span>
                <p className="text-sm text-muted-foreground mt-1">טופלו</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-emerald-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filters */}
        <div className="glass-card p-4 space-y-3">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              placeholder="חפש לפי שם תלמיד או תוכן..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pr-10 bg-muted/50 border-border/50 text-foreground placeholder:text-muted-foreground"
            />
          </div>

          {/* Status Filter */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="bg-muted/50 border-border/50 text-foreground">
              <div className="flex items-center gap-2">
                {statusFilter === 'pending' && <span className="w-2 h-2 rounded-full bg-destructive" />}
                {statusFilter === 'responded' && <span className="w-2 h-2 rounded-full bg-success" />}
                <SelectValue placeholder="סטטוס" />
              </div>
            </SelectTrigger>
            <SelectContent className="bg-popover border-border z-50">
              <SelectItem value="all">כל הסטטוסים</SelectItem>
              <SelectItem value="pending">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-destructive" />
                  ממתינות לטיפול
                </div>
              </SelectItem>
              <SelectItem value="responded">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-success" />
                  טופלו
                </div>
              </SelectItem>
            </SelectContent>
          </Select>

          {/* Category Filter */}
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="bg-muted/50 border-border/50 text-foreground">
              <SelectValue placeholder="כל הסוגים" />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border z-50">
              <SelectItem value="all">כל הסוגים</SelectItem>
              {categories.map(cat => (
                <SelectItem key={cat} value={cat!}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Results Count */}
          <div className="text-sm text-muted-foreground text-left">
            מציג {filteredAlerts.length} מתוך {totalAlerts} התראות
          </div>
        </div>

        {/* Alerts List or Empty State */}
        {filteredAlerts.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-muted/30 flex items-center justify-center">
              <Shield className="w-10 h-10 text-muted-foreground/50" />
            </div>
            <h3 className="font-heebo text-xl font-bold text-foreground mb-2">אין התראות להצגה</h3>
            <p className="text-muted-foreground text-sm">כל ההתראות טופלו - כל הכבוד!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredAlerts.map((alert, index) => (
              <div
                key={alert.id}
                onClick={() => navigate(`/teacher-ticket/${alert.id}`)}
                className={`glass-card p-4 cursor-pointer hover:border-primary/50 transition-all animate-enter animate-enter-${(index % 5) + 1}`}
              >
                <div className="flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-heebo font-bold text-foreground">{alert.child_name}</span>
                      {alert.category && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary">
                          {alert.category}
                        </span>
                      )}
                    </div>
                    {alert.parent_message && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{alert.parent_message}</p>
                    )}
                    <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                      <span>{new Date(alert.created_at).toLocaleDateString('he-IL', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric'
                      })}</span>
                      <span>•</span>
                      <span>{alert.teacher_name || alert.teacher_email}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {alert.status === 'pending' ? (
                      <span className="flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-amber-500/20 text-amber-400">
                        <Clock className="w-3 h-3" />
                        ממתין
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-emerald-500/20 text-emerald-400">
                        <CheckCircle className="w-3 h-3" />
                        טופל
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
