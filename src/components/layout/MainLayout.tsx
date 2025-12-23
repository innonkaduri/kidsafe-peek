import { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { LogOut, Menu } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  const userName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "משתמש";

  return (
    <SidebarProvider defaultOpen>
      <div className="min-h-screen flex w-full bg-background">
        <main className="flex-1 overflow-auto">
          <header className="sticky top-0 z-10 backdrop-blur-xl bg-background/80 border-b border-border/50 px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <SidebarTrigger className="text-muted-foreground hover:text-foreground">
                  <Menu className="h-5 w-5" />
                </SidebarTrigger>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                >
                  מדריך שימוש ✨
                </Button>
              </div>
              
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <h1 className="text-xl font-bold">שלום, {userName} 👋</h1>
                  <p className="text-sm text-muted-foreground">הנה סקירה מהירה של הפעילות</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleSignOut}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <LogOut className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </header>
          
          <div className="p-6">
            {children}
          </div>
        </main>
        
        <AppSidebar />
      </div>
    </SidebarProvider>
  );
}
