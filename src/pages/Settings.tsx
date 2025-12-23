import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Shield, User, Bell, Lock, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function Settings() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState({
    full_name: "",
    email: "",
  });
  const [notifications, setNotifications] = useState({
    email_enabled: true,
    weekly_digest_enabled: true,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) {
      fetchSettings();
    }
  }, [user]);

  const fetchSettings = async () => {
    try {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user?.id)
        .single();

      if (profileData) {
        setProfile({
          full_name: profileData.full_name || "",
          email: profileData.email || user?.email || "",
        });
      }

      const { data: notifData } = await supabase
        .from("notification_settings")
        .select("*")
        .eq("user_id", user?.id)
        .single();

      if (notifData) {
        setNotifications({
          email_enabled: notifData.email_enabled ?? true,
          weekly_digest_enabled: notifData.weekly_digest_enabled ?? true,
        });
      }
    } catch (error) {
      console.error("Error fetching settings:", error);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      await supabase
        .from("profiles")
        .update({ full_name: profile.full_name })
        .eq("id", user?.id);

      await supabase
        .from("notification_settings")
        .update({
          email_enabled: notifications.email_enabled,
          weekly_digest_enabled: notifications.weekly_digest_enabled,
        })
        .eq("user_id", user?.id);

      toast.success("ההגדרות נשמרו בהצלחה");
    } catch (error) {
      console.error("Error saving settings:", error);
      toast.error("שגיאה בשמירת ההגדרות");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
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
      <div className="space-y-6 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-right">הגדרות</h1>

        {/* Profile Settings */}
        <Card className="glass-card p-6">
          <div className="flex items-center gap-3 justify-end mb-6">
            <h2 className="font-bold text-lg">פרטי משתמש</h2>
            <User className="h-5 w-5 text-primary" />
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-right block">שם מלא</label>
              <Input
                value={profile.full_name}
                onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                className="text-right"
                placeholder="השם שלך"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-right block">אימייל</label>
              <Input
                value={profile.email}
                disabled
                className="text-left bg-muted"
                dir="ltr"
              />
              <p className="text-xs text-muted-foreground text-right">
                לא ניתן לשנות את כתובת האימייל
              </p>
            </div>
          </div>
        </Card>

        {/* Notification Settings */}
        <Card className="glass-card p-6">
          <div className="flex items-center gap-3 justify-end mb-6">
            <h2 className="font-bold text-lg">התראות</h2>
            <Bell className="h-5 w-5 text-primary" />
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Switch
                checked={notifications.email_enabled}
                onCheckedChange={(checked) =>
                  setNotifications({ ...notifications, email_enabled: checked })
                }
              />
              <div className="text-right">
                <p className="font-medium">התראות באימייל</p>
                <p className="text-sm text-muted-foreground">
                  קבל התראות על סיכונים חדשים באימייל
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Switch
                checked={notifications.weekly_digest_enabled}
                onCheckedChange={(checked) =>
                  setNotifications({ ...notifications, weekly_digest_enabled: checked })
                }
              />
              <div className="text-right">
                <p className="font-medium">סיכום שבועי</p>
                <p className="text-sm text-muted-foreground">
                  קבל סיכום שבועי של כל הפעילות
                </p>
              </div>
            </div>
          </div>
        </Card>

        {/* Security */}
        <Card className="glass-card p-6">
          <div className="flex items-center gap-3 justify-end mb-6">
            <h2 className="font-bold text-lg">אבטחה</h2>
            <Lock className="h-5 w-5 text-primary" />
          </div>

          <div className="space-y-4">
            <Button variant="outline" className="w-full justify-end">
              שינוי סיסמה
            </Button>
            <Button variant="outline" className="w-full justify-end text-destructive border-destructive/50">
              מחיקת חשבון
            </Button>
          </div>
        </Card>

        <Button onClick={saveSettings} disabled={saving} className="w-full btn-glow">
          <Save className="h-4 w-4 ml-2" />
          {saving ? "שומר..." : "שמור הגדרות"}
        </Button>
      </div>
    </MainLayout>
  );
}
