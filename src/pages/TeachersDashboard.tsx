import { useState, useEffect, useCallback } from 'react';
import { Shield, Users, AlertTriangle, Send, Clock, CheckCircle } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';

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

  const fetchData = useCallback(async () => {
    if (!user) return;

    setLoading(true);

    // Fetch children
    const { data: childrenData } = await supabase
      .from('children')
      .select('id, display_name, age_range')
      .eq('user_id', user.id);

    if (childrenData) {
      const childIds = childrenData.map(c => c.id);

      // Fetch findings count per child
      const childrenWithCounts: ChildWithStatus[] = [];
      
      for (const child of childrenData) {
        const { count: findingsCount } = await supabase
          .from('findings')
          .select('*', { count: 'exact', head: true })
          .eq('child_id', child.id)
          .eq('threat_detected', true);

        const { count: alertsCount } = await supabase
          .from('teacher_alerts')
          .select('*', { count: 'exact', head: true })
          .eq('child_id', child.id);

        childrenWithCounts.push({
          ...child,
          findings_count: findingsCount || 0,
          alerts_sent: alertsCount || 0
        });
      }

      setChildrenWithStatus(childrenWithCounts);

      // Fetch teacher alerts
      if (childIds.length > 0) {
        const { data: alertsData } = await supabase
          .from('teacher_alerts')
          .select('*')
          .in('child_id', childIds)
          .order('created_at', { ascending: false });

        if (alertsData) {
          const alertsWithNames = alertsData.map(a => ({
            ...a,
            child_name: childrenData.find(c => c.id === a.child_id)?.display_name || 'לא ידוע'
          }));
          setTeacherAlerts(alertsWithNames);
        }
      }
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

  // Calculate stats
  const totalChildren = childrenWithStatus.length;
  const childrenWithAlerts = childrenWithStatus.filter(c => c.findings_count > 0).length;
  const pendingAlerts = teacherAlerts.filter(a => a.status === 'pending').length;
  const respondedAlerts = teacherAlerts.filter(a => a.status === 'responded').length;

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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <span className="flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-warning/20 text-warning">
            <Clock className="w-3 h-3" />
            ממתין
          </span>
        );
      case 'responded':
        return (
          <span className="flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-success/20 text-success">
            <CheckCircle className="w-3 h-3" />
            הגיב
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-muted text-muted-foreground">
            {status}
          </span>
        );
    }
  };

  return (
    <Layout>
      <div className="space-y-8 animate-slide-up">
        {/* Header */}
        <div>
          <h1 className="font-heebo text-3xl font-bold text-foreground">דשבורד מורים</h1>
          <p className="text-muted-foreground mt-1">מעקב אחר תקשורת עם מורים ואנשי חינוך</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Card variant="elevated">
            <CardContent className="p-6 flex items-center justify-between">
              <div className="flex flex-col items-center flex-1">
                <span className="text-4xl font-heebo font-bold text-foreground">{totalChildren}</span>
                <p className="text-sm text-muted-foreground mt-1">סה"כ ילדים</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                <Users className="w-6 h-6 text-primary" />
              </div>
            </CardContent>
          </Card>

          <Card variant="elevated">
            <CardContent className="p-6 flex items-center justify-between">
              <div className="flex flex-col items-center flex-1">
                <span className="text-4xl font-heebo font-bold text-warning">{childrenWithAlerts}</span>
                <p className="text-sm text-muted-foreground mt-1">עם התראות</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-warning/20 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-warning" />
              </div>
            </CardContent>
          </Card>

          <Card variant="elevated">
            <CardContent className="p-6 flex items-center justify-between">
              <div className="flex flex-col items-center flex-1">
                <span className="text-4xl font-heebo font-bold text-info">{pendingAlerts}</span>
                <p className="text-sm text-muted-foreground mt-1">ממתינים לתגובה</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-info/20 flex items-center justify-center">
                <Send className="w-6 h-6 text-info" />
              </div>
            </CardContent>
          </Card>

          <Card variant="elevated">
            <CardContent className="p-6 flex items-center justify-between">
              <div className="flex flex-col items-center flex-1">
                <span className="text-4xl font-heebo font-bold text-success">{respondedAlerts}</span>
                <p className="text-sm text-muted-foreground mt-1">קיבלו תגובה</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-success/20 flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-success" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Children List */}
        <div>
          <h2 className="font-heebo text-xl font-bold text-foreground mb-4">סטטוס ילדים</h2>
          
          {childrenWithStatus.length === 0 ? (
            <div className="glass-card p-12 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                <Users className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">אין ילדים במערכת</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {childrenWithStatus.map((child, index) => (
                <div
                  key={child.id}
                  onClick={() => navigate(`/child/${child.id}`)}
                  className={`glass-card p-5 cursor-pointer hover:border-primary/50 transition-all animate-enter animate-enter-${(index % 5) + 1}`}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center">
                      <span className="text-lg font-heebo font-bold text-white">
                        {child.display_name.charAt(0)}
                      </span>
                    </div>
                    <div className="flex-1">
                      <h3 className="font-heebo font-bold text-foreground">{child.display_name}</h3>
                      <p className="text-xs text-muted-foreground">
                        {child.age_range ? `גיל ${child.age_range}` : 'גיל לא צוין'}
                      </p>
                    </div>
                    {child.findings_count > 0 ? (
                      <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-destructive/20">
                        <AlertTriangle className="w-4 h-4 text-destructive" />
                        <span className="text-xs font-medium text-destructive">{child.findings_count}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-success/20">
                        <CheckCircle className="w-4 h-4 text-success" />
                      </div>
                    )}
                  </div>
                  {child.alerts_sent > 0 && (
                    <div className="mt-3 pt-3 border-t border-border/50 text-xs text-muted-foreground">
                      <Send className="w-3 h-3 inline ml-1" />
                      {child.alerts_sent} התראות נשלחו למורים
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Teacher Alerts */}
        <div>
          <h2 className="font-heebo text-xl font-bold text-foreground mb-4">היסטוריית התראות למורים</h2>
          
          {teacherAlerts.length === 0 ? (
            <div className="glass-card p-12 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                <Send className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">לא נשלחו התראות למורים עדיין</p>
            </div>
          ) : (
            <div className="space-y-3">
              {teacherAlerts.slice(0, 10).map((alert, index) => (
                <div
                  key={alert.id}
                  className={`glass-card p-4 animate-enter animate-enter-${(index % 5) + 1}`}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                      <Send className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-foreground">{alert.teacher_name || alert.teacher_email}</span>
                        <span className="text-xs text-muted-foreground">•</span>
                        <span className="text-xs text-muted-foreground">{alert.child_name}</span>
                      </div>
                      {alert.parent_message && (
                        <p className="text-sm text-muted-foreground line-clamp-1">{alert.parent_message}</p>
                      )}
                    </div>
                    {getStatusBadge(alert.status)}
                    <div className="text-xs text-muted-foreground text-left flex-shrink-0">
                      {new Date(alert.created_at).toLocaleDateString('he-IL', {
                        day: 'numeric',
                        month: 'short'
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
