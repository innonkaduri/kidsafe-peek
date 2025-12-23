import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Shield, Users, Plus, CheckCircle2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AddChildDialog } from "@/components/dashboard/AddChildDialog";

interface ChildWithStatus {
  id: string;
  display_name: string;
  age_range: string | null;
  avatar_url: string | null;
  monitoring_enabled: boolean | null;
  lastScanStatus: "safe" | "warning" | "danger";
  openAlerts: number;
}

export default function MyChildren() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [children, setChildren] = useState<ChildWithStatus[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [showAddChild, setShowAddChild] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) {
      fetchChildren();
    }
  }, [user]);

  const fetchChildren = async () => {
    setLoadingData(true);
    try {
      const { data: childrenData } = await supabase
        .from("children")
        .select("*")
        .eq("user_id", user?.id)
        .order("created_at", { ascending: false });

      if (childrenData) {
        const childrenWithStatus: ChildWithStatus[] = await Promise.all(
          childrenData.map(async (child) => {
            const { count } = await supabase
              .from("findings")
              .select("*", { count: "exact", head: true })
              .eq("child_id", child.id)
              .eq("threat_detected", true);

            const status: "safe" | "warning" | "danger" = count && count > 0 ? "warning" : "safe";
            return {
              id: child.id,
              display_name: child.display_name,
              age_range: child.age_range,
              avatar_url: child.avatar_url,
              monitoring_enabled: child.monitoring_enabled,
              openAlerts: count || 0,
              lastScanStatus: status,
            };
          })
        );
        setChildren(childrenWithStatus);
      }
    } catch (error) {
      console.error("Error fetching children:", error);
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

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Button onClick={() => setShowAddChild(true)} className="btn-glow">
            <Plus className="h-4 w-4 ml-2" />
            הוסף ילד
          </Button>
          <h1 className="text-2xl font-bold">הילדים שלי</h1>
        </div>

        {children.length === 0 ? (
          <Card className="glass-card p-12 text-center">
            <Users className="h-16 w-16 mx-auto text-muted-foreground mb-6" />
            <h2 className="text-xl font-bold mb-2">אין ילדים מחוברים</h2>
            <p className="text-muted-foreground mb-6">
              הוסף את הילד הראשון שלך כדי להתחיל לעקוב אחר הפעילות
            </p>
            <Button onClick={() => setShowAddChild(true)} className="btn-glow">
              <Plus className="h-4 w-4 ml-2" />
              הוסף ילד
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {children.map((child) => (
              <Card
                key={child.id}
                className="glass-card p-6 cursor-pointer hover:border-primary/50 transition-all"
                onClick={() => navigate(`/child/${child.id}`)}
              >
                <div className="flex items-start gap-4 justify-end">
                  <div className="flex-1 text-right">
                    <h3 className="font-bold text-lg">{child.display_name}</h3>
                    {child.age_range && (
                      <p className="text-sm text-muted-foreground">גיל {child.age_range}</p>
                    )}
                    
                    <div className="mt-4">
                      {child.lastScanStatus === "safe" ? (
                        <div className="flex items-center gap-2 justify-end text-success">
                          <span className="text-sm">הכל תקין</span>
                          <CheckCircle2 className="h-5 w-5" />
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 justify-end text-warning">
                          <span className="text-sm">{child.openAlerts} התראות</span>
                          <AlertTriangle className="h-5 w-5" />
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="relative">
                    <div className="w-16 h-16 rounded-full bg-primary/30 flex items-center justify-center text-2xl font-bold">
                      {child.display_name.charAt(0)}
                    </div>
                    <Shield 
                      className={`h-5 w-5 absolute -top-1 -right-1 ${
                        child.lastScanStatus === "safe" ? "text-success" : "text-warning"
                      }`} 
                    />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {showAddChild && <AddChildDialog onChildAdded={() => { fetchChildren(); setShowAddChild(false); }} />}
      </div>
    </MainLayout>
  );
}
