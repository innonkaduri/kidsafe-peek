import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  Shield, 
  AlertTriangle, 
  Clock, 
  User, 
  CheckCircle2, 
  Eye,
  Search,
  Plus,
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
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [childFilter, setChildFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

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
      case "critical": return "badge-risk-critical text-white";
      case "high": return "badge-risk-high text-white";
      case "medium": return "badge-risk-medium text-white";
      default: return "badge-risk-low text-white";
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
    if (searchQuery && !a.child_name.includes(searchQuery) && !a.explanation.includes(searchQuery)) return false;
    return true;
  });

  const totalAlerts = alerts.length;
  const inProgressCount = alerts.filter(a => a.status === "in_progress").length;
  const eventsCount = alerts.filter(a => a.risk_level === "high" || a.risk_level === "critical").length;

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
      <div className="space-y-6" dir="rtl">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Total Alerts */}
          <div className="stat-card flex items-center gap-4">
            <div className="icon-container w-14 h-14">
              <AlertTriangle className="h-7 w-7 text-primary icon-glow" />
            </div>
            <div className="text-right flex-1">
              <p className="text-4xl font-bold text-foreground">{totalAlerts}</p>
              <p className="text-sm text-muted-foreground">סך כל ההתראות</p>
            </div>
          </div>

          {/* In Progress */}
          <div className="stat-card flex items-center gap-4">
            <div className="icon-container w-14 h-14 !bg-gradient-to-br !from-warning/20 !to-warning/10 !border-warning/25">
              <Clock className="h-7 w-7 text-warning" style={{ filter: 'drop-shadow(0 0 8px hsl(45 93% 47% / 0.5))' }} />
            </div>
            <div className="text-right flex-1">
              <p className="text-4xl font-bold text-foreground">{inProgressCount}</p>
              <p className="text-sm text-muted-foreground">התראות בטיפול</p>
            </div>
          </div>

          {/* Events */}
          <div className="stat-card flex items-center gap-4">
            <div className="icon-container w-14 h-14 !bg-gradient-to-br !from-success/20 !to-success/10 !border-success/25">
              <Shield className="h-7 w-7 text-success icon-glow-success" />
            </div>
            <div className="text-right flex-1">
              <p className="text-4xl font-bold text-foreground">{eventsCount}</p>
              <p className="text-sm text-muted-foreground">אירועים</p>
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="filter-bar flex-wrap">
          <div className="flex items-center gap-3 flex-1">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="חפש לפי שם הילד או מזהה..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="cyber-input pr-10 w-full"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Realtime indicator */}
            <div className="monitoring-indicator">
              האזנה בזמן אמת
            </div>

            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[140px] bg-background/30 border-primary/15 text-foreground">
                <SelectValue placeholder="סוג אירוע" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל הסוגים</SelectItem>
                <SelectItem value="bullying">בריונות</SelectItem>
                <SelectItem value="predator">איום מבוגר</SelectItem>
                <SelectItem value="self_harm">פגיעה עצמית</SelectItem>
                <SelectItem value="inappropriate">תוכן לא הולם</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Alerts List or Empty State */}
        {filteredAlerts.length === 0 ? (
          <Card className="glass-card-glow">
            <div className="empty-state">
              <div className="empty-state-icon">
                <Shield className="h-12 w-12 text-primary icon-glow" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-2">אין התראות להצגה</h2>
              <p className="text-muted-foreground mb-8 max-w-sm">
                כל המערכות תקינות – כל הכבוד!
              </p>
              <Button className="btn-glow text-white px-8 py-3 rounded-full text-base">
                <Plus className="h-5 w-5 ml-2" />
                דווח חריגה
              </Button>
            </div>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredAlerts.map((alert) => (
              <Card key={alert.id} className="glass-card p-5 hover:border-primary/30 transition-all duration-300">
                <div className="flex items-start justify-between">
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="border-primary/20 text-primary hover:bg-primary/10">
                      <Eye className="h-4 w-4 ml-1" />
                      צפה
                    </Button>
                    <Button variant="outline" size="sm" className="text-success border-success/30 hover:bg-success/10">
                      <CheckCircle2 className="h-4 w-4 ml-1" />
                      טופל
                    </Button>
                  </div>

                  <div className="flex-1 text-right pr-4">
                    <div className="flex items-center gap-3 justify-end mb-2">
                      <Badge className={getRiskColor(alert.risk_level)}>
                        {getRiskLabel(alert.risk_level)}
                      </Badge>
                      <h3 className="font-bold text-foreground">
                        {alert.threat_types.length > 0 
                          ? alert.threat_types.join(", ")
                          : "התראת אבטחה"}
                      </h3>
                      <div className="w-8 h-8 rounded-lg icon-container flex items-center justify-center">
                        <AlertTriangle className={`h-4 w-4 ${
                          alert.risk_level === "critical" ? "text-destructive" :
                          alert.risk_level === "high" ? "text-warning" : "text-primary"
                        }`} />
                      </div>
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