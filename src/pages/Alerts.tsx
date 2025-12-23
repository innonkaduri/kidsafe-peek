import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shield, AlertTriangle, Clock, User, CheckCircle2, XCircle, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { he } from "date-fns/locale";

interface Alert {
  id: string;
  child_id: string;
  child_name: string;
  threat_types: string[];
  risk_level: string;
  explanation: string;
  created_at: string;
  status: "open" | "in_progress" | "resolved";
}

export default function Alerts() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [filter, setFilter] = useState<"all" | "open" | "resolved">("all");

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) {
      fetchAlerts();
    }
  }, [user]);

  const fetchAlerts = async () => {
    setLoadingData(true);
    try {
      const { data: children } = await supabase
        .from("children")
        .select("id, display_name")
        .eq("user_id", user?.id);

      if (!children || children.length === 0) {
        setAlerts([]);
        setLoadingData(false);
        return;
      }

      const childMap = new Map(children.map(c => [c.id, c.display_name]));

      const { data: findings } = await supabase
        .from("findings")
        .select("*")
        .eq("threat_detected", true)
        .in("child_id", children.map(c => c.id))
        .order("created_at", { ascending: false });

      if (findings) {
        const alertsList: Alert[] = findings.map(f => ({
          id: f.id,
          child_id: f.child_id,
          child_name: childMap.get(f.child_id) || "ילד",
          threat_types: Array.isArray(f.threat_types) ? (f.threat_types as string[]) : [],
          risk_level: f.risk_level || "medium",
          explanation: f.explanation || "",
          created_at: f.created_at || "",
          status: "open" as const,
        }));
        setAlerts(alertsList);
      }
    } catch (error) {
      console.error("Error fetching alerts:", error);
    } finally {
      setLoadingData(false);
    }
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case "critical": return "bg-destructive text-destructive-foreground";
      case "high": return "bg-risk-high text-white";
      case "medium": return "bg-warning text-warning-foreground";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getRiskLabel = (level: string) => {
    switch (level) {
      case "critical": return "קריטי";
      case "high": return "גבוה";
      case "medium": return "בינוני";
      default: return "נמוך";
    }
  };

  const filteredAlerts = alerts.filter(a => {
    if (filter === "all") return true;
    if (filter === "open") return a.status === "open";
    if (filter === "resolved") return a.status === "resolved";
    return true;
  });

  if (loading || loadingData) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <Shield className="h-12 w-12 text-primary animate-pulse" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <Button
              variant={filter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("all")}
            >
              הכל ({alerts.length})
            </Button>
            <Button
              variant={filter === "open" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("open")}
            >
              פתוחות
            </Button>
            <Button
              variant={filter === "resolved" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("resolved")}
            >
              טופלו
            </Button>
          </div>
          <h1 className="text-2xl font-bold">התראות</h1>
        </div>

        {filteredAlerts.length === 0 ? (
          <Card className="glass-card p-12 text-center bg-success/10 border-success/30">
            <Shield className="h-16 w-16 mx-auto text-success mb-6" />
            <h2 className="text-xl font-bold text-success mb-2">הכל תקין!</h2>
            <p className="text-muted-foreground">אין התראות פתוחות כרגע</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredAlerts.map((alert) => (
              <Card key={alert.id} className="glass-card p-4 hover:border-primary/50 transition-all">
                <div className="flex items-start justify-between">
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm">
                      <Eye className="h-4 w-4 ml-1" />
                      צפה
                    </Button>
                    <Button variant="outline" size="sm" className="text-success border-success/50">
                      <CheckCircle2 className="h-4 w-4 ml-1" />
                      טופל
                    </Button>
                  </div>

                  <div className="flex-1 text-right pr-4">
                    <div className="flex items-center gap-3 justify-end mb-2">
                      <Badge className={getRiskColor(alert.risk_level)}>
                        {getRiskLabel(alert.risk_level)}
                      </Badge>
                      <h3 className="font-bold">
                        {alert.threat_types.length > 0 
                          ? alert.threat_types.join(", ")
                          : "התראת אבטחה"}
                      </h3>
                      <AlertTriangle className={`h-5 w-5 ${
                        alert.risk_level === "critical" ? "text-destructive" :
                        alert.risk_level === "high" ? "text-orange-500" : "text-warning"
                      }`} />
                    </div>

                    <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                      {alert.explanation || "נמצאה פעילות חשודה שדורשת תשומת לב"}
                    </p>

                    <div className="flex items-center gap-4 text-xs text-muted-foreground justify-end">
                      <div className="flex items-center gap-1">
                        <span>
                          {formatDistanceToNow(new Date(alert.created_at), {
                            addSuffix: true,
                            locale: he,
                          })}
                        </span>
                        <Clock className="h-3 w-3" />
                      </div>
                      <div className="flex items-center gap-1">
                        <span>{alert.child_name}</span>
                        <User className="h-3 w-3" />
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
