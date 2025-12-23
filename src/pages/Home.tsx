import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Shield, Users, Bell, AlertTriangle, Activity, ChevronLeft, CheckCircle2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Child {
  id: string;
  display_name: string;
  age_range: string | null;
  avatar_url: string | null;
}

interface Stats {
  childrenCount: number;
  activeConnectors: number;
  openAlerts: number;
  highRiskCount: number;
}

export default function Home() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [children, setChildren] = useState<Child[]>([]);
  const [stats, setStats] = useState<Stats>({
    childrenCount: 0,
    activeConnectors: 0,
    openAlerts: 0,
    highRiskCount: 0,
  });
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    setLoadingData(true);
    try {
      // Fetch children
      const { data: childrenData } = await supabase
        .from("children")
        .select("id, display_name, age_range, avatar_url")
        .eq("user_id", user?.id);

      const childList = childrenData || [];
      setChildren(childList);

      // Fetch stats
      const { count: alertsCount } = await supabase
        .from("findings")
        .select("*", { count: "exact", head: true })
        .eq("threat_detected", true)
        .in("child_id", childList.map(c => c.id));

      const { count: highRisk } = await supabase
        .from("findings")
        .select("*", { count: "exact", head: true })
        .eq("threat_detected", true)
        .in("risk_level", ["high", "critical"])
        .in("child_id", childList.map(c => c.id));

      const { count: connectors } = await supabase
        .from("data_sources")
        .select("*", { count: "exact", head: true })
        .eq("status", "active")
        .in("child_id", childList.map(c => c.id));

      setStats({
        childrenCount: childList.length,
        activeConnectors: connectors || 0,
        openAlerts: alertsCount || 0,
        highRiskCount: highRisk || 0,
      });
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoadingData(false);
    }
  };

  if (loading || loadingData) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <Shield className="h-12 w-12 text-primary animate-pulse icon-glow" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Active Connections */}
          <div className="stat-card flex items-center gap-4">
            <div className="icon-container w-14 h-14 !bg-gradient-to-br !from-success/20 !to-success/10 !border-success/25">
              <Activity className="h-7 w-7 text-success icon-glow-success" />
            </div>
            <div className="text-right flex-1">
              <p className="text-4xl font-bold text-foreground">{stats.activeConnectors}</p>
              <p className="text-sm text-muted-foreground">חיבורים פעילים</p>
            </div>
          </div>

          {/* Open Alerts */}
          <div className="stat-card flex items-center gap-4">
            <div className="icon-container w-14 h-14 !bg-gradient-to-br !from-warning/20 !to-warning/10 !border-warning/25">
              <Bell className="h-7 w-7 text-warning" style={{ filter: 'drop-shadow(0 0 8px hsl(45 93% 47% / 0.5))' }} />
            </div>
            <div className="text-right flex-1">
              <p className="text-4xl font-bold text-foreground">{stats.openAlerts}</p>
              <p className="text-sm text-muted-foreground">התראות פתוחות</p>
            </div>
          </div>

          {/* High Risk */}
          <div className="stat-card flex items-center gap-4">
            <div className="icon-container w-14 h-14 !bg-gradient-to-br !from-destructive/20 !to-destructive/10 !border-destructive/25">
              <AlertTriangle className="h-7 w-7 text-destructive" style={{ filter: 'drop-shadow(0 0 8px hsl(0 72% 51% / 0.5))' }} />
            </div>
            <div className="text-right flex-1">
              <p className="text-4xl font-bold text-foreground">{stats.highRiskCount}</p>
              <p className="text-sm text-muted-foreground">סיכון גבוה</p>
            </div>
          </div>
        </div>

        {/* My Children Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Button
              variant="link"
              className="text-primary p-0 hover:text-primary/80"
              onClick={() => navigate("/my-children")}
            >
              הצג הכל
              <ChevronLeft className="h-4 w-4 mr-1" />
            </Button>
            <h2 className="text-xl font-bold text-foreground">הילדים שלי</h2>
          </div>

          {children.length === 0 ? (
            <Card className="glass-card-glow p-8 text-center">
              <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">אין ילדים מחוברים עדיין</p>
              <Button onClick={() => navigate("/my-children")} className="btn-glow text-white">
                <Plus className="h-4 w-4 ml-2" />
                הוסף ילד
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {children.slice(0, 3).map((child) => (
                <Card
                  key={child.id}
                  className="glass-card p-4 cursor-pointer hover:border-primary/30 transition-all duration-300"
                  onClick={() => navigate(`/child/${child.id}`)}
                >
                  <div className="flex items-center gap-4 justify-end">
                    <div className="text-right flex-1">
                      <h3 className="font-bold text-foreground">{child.display_name}</h3>
                      {child.age_range && (
                        <p className="text-sm text-muted-foreground">גיל {child.age_range}</p>
                      )}
                      <div className="flex items-center gap-1 justify-end mt-2 text-success text-sm">
                        <span>הכל תקין</span>
                        <CheckCircle2 className="h-4 w-4" />
                      </div>
                    </div>
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center text-xl font-bold text-primary border border-primary/20">
                      {child.display_name.charAt(0)}
                    </div>
                    <Shield className="h-5 w-5 text-success icon-glow-success" />
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Recent Alerts Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Button
              variant="link"
              className="text-primary p-0 hover:text-primary/80"
              onClick={() => navigate("/alerts")}
            >
              הצג הכל
              <ChevronLeft className="h-4 w-4 mr-1" />
            </Button>
            <h2 className="text-xl font-bold text-foreground">התראות אחרונות</h2>
          </div>

          <Card className="glass-card-glow">
            <div className="empty-state py-12">
              <div className="empty-state-icon !bg-gradient-to-br !from-success/15 !to-success/5 !border-success/20">
                <Shield className="h-12 w-12 text-success icon-glow-success" />
              </div>
              <h3 className="text-xl font-bold text-success mb-2">הכל תקין!</h3>
              <p className="text-muted-foreground">אין התראות פתוחות כרגע</p>
            </div>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
}