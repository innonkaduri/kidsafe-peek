import { useState, useEffect, useCallback } from 'react';
import { Shield, Users, AlertTriangle, Scan } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { ChildCard } from '@/components/dashboard/ChildCard';
import { AddChildDialog } from '@/components/dashboard/AddChildDialog';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Child, Scan as ScanType } from '@/types/database';
import { useNavigate } from 'react-router-dom';

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [children, setChildren] = useState<Child[]>([]);
  const [scansMap, setScansMap] = useState<Record<string, ScanType>>({});
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!user) return;

    setLoading(true);

    // Fetch children
    const { data: childrenData } = await supabase
      .from('children')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (childrenData) {
      setChildren(childrenData as Child[]);

      // Fetch last scan for each child
      const scans: Record<string, ScanType> = {};
      for (const child of childrenData) {
        const { data: scanData } = await supabase
          .from('scans')
          .select('*')
          .eq('child_id', child.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (scanData) {
          scans[child.id] = scanData as ScanType;
        }
      }
      setScansMap(scans);
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

  const totalFindings = Object.values(scansMap).reduce((sum, scan) => {
    const summary = scan.summary_json as { threat_count?: number } | null;
    return sum + (summary?.threat_count || 0);
  }, 0);

  return (
    <Layout>
      <div className="space-y-8 animate-slide-up">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card variant="elevated">
            <CardContent className="p-6 flex items-center justify-between">
              <div className="flex flex-col items-center flex-1">
                <span className="text-4xl font-heebo font-bold text-foreground">{children.length}</span>
                <p className="text-sm text-muted-foreground mt-1">סך הכל התראות</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-warning/20 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-warning" />
              </div>
            </CardContent>
          </Card>

          <Card variant="elevated">
            <CardContent className="p-6 flex items-center justify-between">
              <div className="flex flex-col items-center flex-1">
                <span className="text-4xl font-heebo font-bold text-foreground">
                  {Object.keys(scansMap).length}
                </span>
                <p className="text-sm text-muted-foreground mt-1">סריקות לטיפול</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-cyan-500/20 flex items-center justify-center">
                <Scan className="w-6 h-6 text-cyan-400" />
              </div>
            </CardContent>
          </Card>

          <Card variant="elevated">
            <CardContent className="p-6 flex items-center justify-between">
              <div className="flex flex-col items-center flex-1">
                <span className="text-4xl font-heebo font-bold text-foreground">{totalFindings}</span>
                <p className="text-sm text-muted-foreground mt-1">סטטוס</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-success/20 flex items-center justify-center">
                <Shield className="w-6 h-6 text-success" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search & Filter Bar */}
        <Card>
          <CardContent className="p-4 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 text-destructive">
              <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
              <span className="text-sm">התרעות לטיפול</span>
            </div>
            <div className="flex-1 min-w-[200px]">
              <input
                type="text"
                placeholder="חפש לפי שם הילד/ה או מילה..."
                className="w-full bg-input border border-border rounded-xl px-4 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div className="text-sm text-muted-foreground">
              מציג 0 מתוך 0 התראות
            </div>
          </CardContent>
        </Card>

        {/* Main Content Area */}
        {children.length === 0 ? (
          <Card className="border-2 border-dashed border-primary/30">
            <CardContent className="py-16 text-center">
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-primary/10 flex items-center justify-center">
                <Shield className="w-10 h-10 text-primary" />
              </div>
              <h3 className="font-heebo text-2xl font-bold mb-3 text-foreground">
                אין התראות להצגה
              </h3>
              <p className="text-muted-foreground mb-6">
                כל ההתראות סופלו - כל הכבוד!
              </p>
              <AddChildDialog onChildAdded={fetchData} />
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {children.map((child) => (
              <ChildCard
                key={child.id}
                child={child}
                lastScan={scansMap[child.id]}
              />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
