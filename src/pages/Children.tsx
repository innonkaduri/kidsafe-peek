import { useState, useEffect, useCallback } from 'react';
import { Shield, Plus, CheckCircle, AlertTriangle } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { AddChildDialog } from '@/components/dashboard/AddChildDialog';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Child, Scan as ScanType } from '@/types/database';
import { useNavigate } from 'react-router-dom';

export default function Children() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [children, setChildren] = useState<Child[]>([]);
  const [scansMap, setScansMap] = useState<Record<string, ScanType>>({});
  const [findingsCount, setFindingsCount] = useState<Record<string, number>>({});
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

      // Fetch last scan and findings count for each child
      const scans: Record<string, ScanType> = {};
      const findings: Record<string, number> = {};
      
      for (const child of childrenData) {
        // Last scan
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

        // Open findings count
        const { count } = await supabase
          .from('findings')
          .select('*', { count: 'exact', head: true })
          .eq('child_id', child.id)
          .eq('threat_detected', true);

        findings[child.id] = count || 0;
      }
      
      setScansMap(scans);
      setFindingsCount(findings);
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

  const getChildStatus = (childId: string) => {
    const count = findingsCount[childId] || 0;
    if (count === 0) {
      return { text: 'הכל תקין ✓', color: 'text-success', bgColor: 'bg-success/20' };
    } else if (count <= 2) {
      return { text: `${count} התראות`, color: 'text-warning', bgColor: 'bg-warning/20' };
    } else {
      return { text: `${count} התראות`, color: 'text-destructive', bgColor: 'bg-destructive/20' };
    }
  };

  return (
    <Layout>
      <div className="space-y-8 animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heebo text-3xl font-bold text-foreground">הילדים שלי</h1>
            <p className="text-muted-foreground mt-1">נהל את הילדים המנוטרים</p>
          </div>
          <AddChildDialog onChildAdded={fetchData} />
        </div>

        {/* Children List */}
        {children.length === 0 ? (
          <div className="glass-card p-16 text-center">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-primary/10 flex items-center justify-center">
              <Shield className="w-10 h-10 text-primary" />
            </div>
            <h3 className="font-heebo text-2xl font-bold mb-3 text-foreground">
              אין ילדים עדיין
            </h3>
            <p className="text-muted-foreground mb-6">
              הוסיפו את הילד/ה הראשון/ה כדי להתחיל בניטור
            </p>
            <AddChildDialog onChildAdded={fetchData} />
          </div>
        ) : (
          <div className="space-y-4">
            {children.map((child, index) => {
              const status = getChildStatus(child.id);
              
              return (
                <div
                  key={child.id}
                  onClick={() => navigate(`/child/${child.id}`)}
                  className={`glass-card p-6 flex items-center gap-6 cursor-pointer hover:border-primary/50 transition-all animate-enter animate-enter-${index + 1}`}
                >
                  {/* Avatar */}
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/30 flex-shrink-0">
                    <span className="text-2xl font-heebo font-bold text-white">
                      {child.display_name.charAt(0)}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-heebo text-xl font-bold text-foreground">
                      {child.display_name}
                    </h3>
                    <p className="text-muted-foreground text-sm">
                      {child.age_range ? `גיל ${child.age_range}` : 'גיל לא צוין'}
                    </p>
                  </div>

                  {/* Status Badge */}
                  <div className={`flex items-center gap-2 px-4 py-2 rounded-full ${status.bgColor}`}>
                    {findingsCount[child.id] === 0 ? (
                      <CheckCircle className={`w-5 h-5 ${status.color}`} />
                    ) : (
                      <AlertTriangle className={`w-5 h-5 ${status.color}`} />
                    )}
                    <span className={`font-assistant font-medium ${status.color}`}>
                      {status.text}
                    </span>
                  </div>

                  {/* Shield Icon */}
                  <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <Shield className="w-6 h-6 text-primary" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
