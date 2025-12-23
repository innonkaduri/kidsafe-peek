import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Shield, 
  AlertTriangle, 
  Clock, 
  User, 
  CheckCircle2, 
  Eye,
  Filter,
  Bell,
  ChevronDown
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { he } from "date-fns/locale";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

interface Child {
  id: string;
  display_name: string;
}

export default function Alerts() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [childFilter, setChildFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

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
      const { data: childrenData } = await supabase
        .from("children")
        .select("id, display_name")
        .eq("user_id", user?.id);

      if (!childrenData || childrenData.length === 0) {
        setAlerts([]);
        setChildren([]);
        setLoadingData(false);
        return;
      }

      setChildren(childrenData);
      const childMap = new Map(childrenData.map(c => [c.id, c.display_name]));

      const { data: findings } = await supabase
        .from("findings")
        .select("*")
        .eq("threat_detected", true)
        .in("child_id", childrenData.map(c => c.id))
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
    if (statusFilter === "open" && a.status !== "open") return false;
    if (statusFilter === "resolved" && a.status !== "resolved") return false;
    if (childFilter !== "all" && a.child_id !== childFilter) return false;
    return true;
  });

  const openCount = alerts.filter(a => a.status === "open").length;
  const highRiskCount = alerts.filter(a => a.risk_level === "high" || a.risk_level === "critical").length;
  const resolvedCount = alerts.filter(a => a.status === "resolved").length;

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
      <div className="space-y-6" dir="rtl">
        {/* Header */}
        <div className="text-right">
          <h1 className="text-2xl font-bold text-foreground">התראות</h1>
          <p className="text-muted-foreground">כל ההתראות שזוהו במערכת</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Open Alerts */}
          <Card className="glass-card p-4 flex items-center justify-between">
            <div className="bg-primary/20 p-3 rounded-full">
              <Bell className="h-6 w-6 text-primary" />
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-foreground">{openCount}</p>
              <p className="text-sm text-muted-foreground">פתוחות</p>
            </div>
          </Card>

          {/* High Risk */}
          <Card className="glass-card p-4 flex items-center justify-between">
            <div className="bg-warning/20 p-3 rounded-full">
              <AlertTriangle className="h-6 w-6 text-warning" />
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-foreground">{highRiskCount}</p>
              <p className="text-sm text-muted-foreground">סיכון גבוה</p>
            </div>
          </Card>

          {/* Resolved */}
          <Card className="glass-card p-4 flex items-center justify-between">
            <div className="bg-success/20 p-3 rounded-full">
              <CheckCircle2 className="h-6 w-6 text-success" />
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-foreground">{resolvedCount}</p>
              <p className="text-sm text-muted-foreground">טופלו</p>
            </div>
          </Card>
        </div>

        {/* Filters */}
        <Card className="glass-card p-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              <Select value={childFilter} onValueChange={setChildFilter}>
                <SelectTrigger className="w-[150px] bg-background/50 border-border/50">
                  <SelectValue placeholder="כל הילדים" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">כל הילדים</SelectItem>
                  {children.map(child => (
                    <SelectItem key={child.id} value={child.id}>
                      {child.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[150px] bg-background/50 border-border/50">
                  <SelectValue placeholder="כל הסוגים" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">כל הסוגים</SelectItem>
                  <SelectItem value="bullying">בריונות</SelectItem>
                  <SelectItem value="predator">איום מבוגר</SelectItem>
                  <SelectItem value="self_harm">פגיעה עצמית</SelectItem>
                  <SelectItem value="inappropriate">תוכן לא הולם</SelectItem>
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px] bg-background/50 border-border/50">
                  <SelectValue placeholder="פתוחות" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">הכל</SelectItem>
                  <SelectItem value="open">פתוחות</SelectItem>
                  <SelectItem value="resolved">טופלו</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 text-muted-foreground">
              <span>סינון</span>
              <Filter className="h-5 w-5" />
            </div>
          </div>
        </Card>

        {/* Alerts List or Empty State */}
        {filteredAlerts.length === 0 ? (
          <Card className="glass-card p-12 text-center">
            <Shield className="h-20 w-20 mx-auto text-success/60 mb-6" />
            <h2 className="text-xl font-bold text-foreground mb-2">אין התראות פתוחות</h2>
            <p className="text-muted-foreground">כל ההתראות טופלו או שאין התראות חדשות</p>
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
                    <Button variant="outline" size="sm" className="text-success border-success/50 hover:bg-success/10">
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
                        alert.risk_level === "high" ? "text-warning" : "text-muted-foreground"
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
