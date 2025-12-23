import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Shield, Users, Bell, AlertTriangle, Activity, ChevronLeft, CheckCircle2 } from "lucide-react";
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
          <Shield className="h-12 w-12 text-primary animate-pulse" />
        </div>
      </MainLayout>
    );
  }

  const statCards = [
    {
      label: "חיבורים פעילים",
      value: stats.activeConnectors,
      icon: Activity,
      bgColor: "bg-emerald-100",
      iconColor: "text-emerald-600",
    },
    {
      label: "התראות פתוחות",
      value: stats.openAlerts,
      icon: Bell,
      bgColor: "bg-amber-100",
      iconColor: "text-amber-600",
    },
    {
      label: "סיכון גבוה",
      value: stats.highRiskCount,
      icon: AlertTriangle,
      bgColor: "bg-red-100",
      iconColor: "text-red-500",
    },
  ];

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {statCards.map((stat, index) => (
            <div 
              key={index} 
              className="stat-card flex items-center justify-between"
            >
              <div className={`p-3 rounded-xl ${stat.bgColor}`}>
                <stat.icon className={`h-6 w-6 ${stat.iconColor}`} />
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-gray-800">{stat.value}</p>
                <p className="text-sm text-gray-500">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* My Children Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Button
              variant="link"
              className="text-primary p-0"
              onClick={() => navigate("/my-children")}
            >
              הצג הכל
              <ChevronLeft className="h-4 w-4 mr-1" />
            </Button>
            <h2 className="text-xl font-bold">הילדים שלי</h2>
          </div>

          {children.length === 0 ? (
            <Card className="glass-card p-8 text-center">
              <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">אין ילדים מחוברים עדיין</p>
              <Button onClick={() => navigate("/my-children")} className="btn-glow">
                הוסף ילד
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {children.slice(0, 3).map((child) => (
                <Card
                  key={child.id}
                  className="glass-card p-4 cursor-pointer hover:border-primary/50 transition-all"
                  onClick={() => navigate(`/child/${child.id}`)}
                >
                  <div className="flex items-center gap-4 justify-end">
                    <div className="text-right">
                      <h3 className="font-bold">{child.display_name}</h3>
                      {child.age_range && (
                        <p className="text-sm text-muted-foreground">גיל {child.age_range}</p>
                      )}
                      <div className="flex items-center gap-1 justify-end mt-2 text-success text-sm">
                        <span>הכל תקין</span>
                        <CheckCircle2 className="h-4 w-4" />
                      </div>
                    </div>
                    <div className="w-14 h-14 rounded-full bg-primary/30 flex items-center justify-center text-2xl">
                      {child.display_name.charAt(0)}
                    </div>
                    <Shield className="h-5 w-5 text-success" />
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
              className="text-primary p-0"
              onClick={() => navigate("/alerts")}
            >
              הצג הכל
              <ChevronLeft className="h-4 w-4 mr-1" />
            </Button>
            <h2 className="text-xl font-bold">התראות אחרונות</h2>
          </div>

          <Card className="glass-card p-8 bg-success/10 border-success/30">
            <div className="text-center">
              <Shield className="h-12 w-12 mx-auto text-success mb-4" />
              <h3 className="text-xl font-bold text-success">הכל תקין!</h3>
              <p className="text-muted-foreground">אין התראות פתוחות כרגע</p>
            </div>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
}
