import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowRight, User, Shield } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { ChildTabs } from '@/components/child/ChildTabs';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Child } from '@/types/database';

export default function ChildProfile() {
  const { childId } = useParams<{ childId: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [child, setChild] = useState<Child | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchChild = useCallback(async () => {
    if (!user || !childId) return;

    setLoading(true);

    const { data, error } = await supabase
      .from('children')
      .select('*')
      .eq('id', childId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (error || !data) {
      navigate('/');
      return;
    }

    setChild(data as Child);
    setLoading(false);
  }, [user, childId, navigate]);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
      return;
    }

    fetchChild();
  }, [user, authLoading, navigate, fetchChild]);

  if (authLoading || loading || !child) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <Shield className="w-16 h-16 mx-auto mb-4 text-primary animate-pulse" />
            <p className="text-muted-foreground">טוען פרופיל...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6 animate-slide-up">
        {/* Breadcrumb & Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button asChild variant="ghost" size="icon">
            <Link to="/">
              <ArrowRight className="w-5 h-5" />
            </Link>
          </Button>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-cyan-500/20 flex items-center justify-center border border-primary/20">
              {child.avatar_url ? (
                <img 
                  src={child.avatar_url} 
                  alt={child.display_name} 
                  className="w-full h-full rounded-2xl object-cover"
                />
              ) : (
                <User className="w-7 h-7 text-primary" />
              )}
            </div>
            <div>
              <h1 className="font-heebo text-2xl font-bold">{child.display_name}</h1>
              <div className="flex items-center gap-3">
                {child.age_range && (
                  <span className="text-sm text-muted-foreground">
                    גילאי {child.age_range}
                  </span>
                )}
                {child.monitoring_enabled && (
                  <div className="monitoring-indicator">
                    <span>ניטור פעיל</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Tabs Content */}
        <ChildTabs child={child} onRefresh={fetchChild} />
      </div>
    </Layout>
  );
}
