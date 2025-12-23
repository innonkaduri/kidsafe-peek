import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield, GraduationCap, Send, Clock, User, MessageSquare, Plus, CheckCircle2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { he } from "date-fns/locale";
import { toast } from "sonner";

interface TeacherAlert {
  id: string;
  child_id: string;
  child_name: string;
  teacher_email: string;
  teacher_name: string | null;
  status: string;
  parent_message: string | null;
  teacher_response: string | null;
  responded_at: string | null;
  created_at: string;
  finding_explanation: string | null;
}

interface Child {
  id: string;
  display_name: string;
}

interface Finding {
  id: string;
  explanation: string | null;
  threat_types: any;
  risk_level: string | null;
}

export default function TeachersDashboard() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<TeacherAlert[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [showNewAlert, setShowNewAlert] = useState(false);
  const [sending, setSending] = useState(false);

  // Form state
  const [selectedChild, setSelectedChild] = useState("");
  const [selectedFinding, setSelectedFinding] = useState("");
  const [teacherEmail, setTeacherEmail] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [parentMessage, setParentMessage] = useState("");

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

  useEffect(() => {
    if (selectedChild) {
      fetchFindingsForChild(selectedChild);
    }
  }, [selectedChild]);

  const fetchData = async () => {
    setLoadingData(true);
    try {
      // Fetch children
      const { data: childrenData } = await supabase
        .from("children")
        .select("id, display_name")
        .eq("user_id", user?.id);

      setChildren(childrenData || []);

      // Fetch teacher alerts
      const { data: alertsData } = await supabase
        .from("teacher_alerts")
        .select("*")
        .eq("parent_user_id", user?.id)
        .order("created_at", { ascending: false });

      if (alertsData && childrenData) {
        const childMap = new Map(childrenData.map(c => [c.id, c.display_name]));
        
        const alertsWithNames = await Promise.all(
          alertsData.map(async (alert) => {
            let findingExplanation = null;
            if (alert.finding_id) {
              const { data: finding } = await supabase
                .from("findings")
                .select("explanation")
                .eq("id", alert.finding_id)
                .single();
              findingExplanation = finding?.explanation;
            }

            return {
              ...alert,
              child_name: childMap.get(alert.child_id) || "ילד",
              finding_explanation: findingExplanation,
            };
          })
        );

        setAlerts(alertsWithNames);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoadingData(false);
    }
  };

  const fetchFindingsForChild = async (childId: string) => {
    const { data } = await supabase
      .from("findings")
      .select("id, explanation, threat_types, risk_level")
      .eq("child_id", childId)
      .eq("threat_detected", true)
      .order("created_at", { ascending: false });

    setFindings(data || []);
  };

  const sendAlert = async () => {
    if (!selectedChild || !teacherEmail.trim()) {
      toast.error("יש לבחור ילד ולהזין אימייל של מורה");
      return;
    }

    setSending(true);
    try {
      const { error } = await supabase.from("teacher_alerts").insert({
        parent_user_id: user?.id,
        child_id: selectedChild,
        finding_id: selectedFinding || null,
        teacher_email: teacherEmail.trim(),
        teacher_name: teacherName.trim() || null,
        parent_message: parentMessage.trim() || null,
      });

      if (error) throw error;

      toast.success("הדיווח נשלח בהצלחה");
      setShowNewAlert(false);
      resetForm();
      fetchData();
    } catch (error) {
      console.error("Error sending alert:", error);
      toast.error("שגיאה בשליחת הדיווח");
    } finally {
      setSending(false);
    }
  };

  const resetForm = () => {
    setSelectedChild("");
    setSelectedFinding("");
    setTeacherEmail("");
    setTeacherName("");
    setParentMessage("");
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="text-warning border-warning">ממתין</Badge>;
      case "responded":
        return <Badge className="bg-success text-success-foreground">נענה</Badge>;
      case "closed":
        return <Badge variant="secondary">סגור</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
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

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Dialog open={showNewAlert} onOpenChange={setShowNewAlert}>
            <DialogTrigger asChild>
              <Button className="btn-glow">
                <Plus className="h-4 w-4 ml-2" />
                דווח למורה
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-right">דיווח למורה / גורם חינוכי</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-right block">בחר ילד</label>
                  <Select value={selectedChild} onValueChange={setSelectedChild}>
                    <SelectTrigger className="text-right">
                      <SelectValue placeholder="בחר ילד" />
                    </SelectTrigger>
                    <SelectContent>
                      {children.map((child) => (
                        <SelectItem key={child.id} value={child.id}>
                          {child.display_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {findings.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-right block">בחר התראה לשיתוף (אופציונלי)</label>
                    <Select value={selectedFinding} onValueChange={setSelectedFinding}>
                      <SelectTrigger className="text-right">
                        <SelectValue placeholder="בחר התראה" />
                      </SelectTrigger>
                      <SelectContent>
                        {findings.map((finding) => (
                          <SelectItem key={finding.id} value={finding.id}>
                            {finding.explanation?.slice(0, 50) || "התראה"}...
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-medium text-right block">שם המורה</label>
                  <Input
                    value={teacherName}
                    onChange={(e) => setTeacherName(e.target.value)}
                    placeholder="שם המורה"
                    className="text-right"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-right block">אימייל המורה *</label>
                  <Input
                    type="email"
                    value={teacherEmail}
                    onChange={(e) => setTeacherEmail(e.target.value)}
                    placeholder="teacher@school.com"
                    className="text-left"
                    dir="ltr"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-right block">הודעה למורה</label>
                  <Textarea
                    value={parentMessage}
                    onChange={(e) => setParentMessage(e.target.value)}
                    placeholder="תאר את המצב והבקשה שלך..."
                    className="text-right min-h-[100px]"
                  />
                </div>

                <Button
                  onClick={sendAlert}
                  disabled={sending || !selectedChild || !teacherEmail}
                  className="w-full btn-glow"
                >
                  <Send className="h-4 w-4 ml-2" />
                  שלח דיווח
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <h1 className="text-2xl font-bold">דשבורד מורים</h1>
        </div>

        <Card className="glass-card p-4">
          <div className="flex items-center gap-3 justify-end">
            <div className="text-right">
              <p className="font-semibold">שיתוף התראות עם גורמים חינוכיים</p>
              <p className="text-sm text-muted-foreground">
                שתף התראות עם מורים ויועצים ועקוב אחר הטיפול
              </p>
            </div>
            <GraduationCap className="h-8 w-8 text-primary" />
          </div>
        </Card>

        {alerts.length === 0 ? (
          <Card className="glass-card p-12 text-center">
            <GraduationCap className="h-16 w-16 mx-auto text-muted-foreground mb-6" />
            <h2 className="text-xl font-bold mb-2">אין דיווחים</h2>
            <p className="text-muted-foreground mb-6">
              טרם שיתפת התראות עם מורים או גורמים חינוכיים
            </p>
            <Button onClick={() => setShowNewAlert(true)} className="btn-glow">
              <Plus className="h-4 w-4 ml-2" />
              דווח למורה
            </Button>
          </Card>
        ) : (
          <div className="space-y-4">
            {alerts.map((alert) => (
              <Card key={alert.id} className="glass-card p-4">
                <div className="flex items-start justify-between">
                  <div className="flex flex-col gap-2">
                    {getStatusBadge(alert.status)}
                    {alert.teacher_response && (
                      <div className="mt-2 p-3 bg-success/10 rounded-lg border border-success/30">
                        <div className="flex items-center gap-2 text-success mb-1">
                          <MessageSquare className="h-4 w-4" />
                          <span className="text-sm font-medium">תגובת המורה:</span>
                        </div>
                        <p className="text-sm text-right">{alert.teacher_response}</p>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 text-right pr-4">
                    <div className="flex items-center gap-2 justify-end mb-2">
                      <h3 className="font-bold">דיווח ל{alert.teacher_name || alert.teacher_email}</h3>
                      <GraduationCap className="h-5 w-5 text-primary" />
                    </div>

                    <div className="flex items-center gap-2 text-sm text-muted-foreground justify-end mb-2">
                      <span>{alert.child_name}</span>
                      <User className="h-4 w-4" />
                    </div>

                    {alert.parent_message && (
                      <p className="text-sm text-muted-foreground mb-2">
                        {alert.parent_message}
                      </p>
                    )}

                    {alert.finding_explanation && (
                      <div className="p-2 bg-warning/10 rounded border border-warning/30 mb-2">
                        <div className="flex items-center gap-1 text-warning text-xs mb-1">
                          <AlertTriangle className="h-3 w-3" />
                          <span>התראה משותפת:</span>
                        </div>
                        <p className="text-xs">{alert.finding_explanation}</p>
                      </div>
                    )}

                    <div className="flex items-center gap-1 text-xs text-muted-foreground justify-end">
                      <span>
                        {formatDistanceToNow(new Date(alert.created_at), {
                          addSuffix: true,
                          locale: he,
                        })}
                      </span>
                      <Clock className="h-3 w-3" />
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
