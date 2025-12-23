import { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { LogOut, Menu, Shield } from "lucide-react";
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
      <div className="min-h-screen flex w-full cyber-bg">
        <main className="flex-1 overflow-auto relative z-10">
          {/* Header */}
          <header className="sticky top-0 z-20 backdrop-blur-xl bg-background/60 border-b border-border/30 px-6 py-4">
            <div className="flex items-center justify-between">
              {/* Left side - toggle & logout */}
              <div className="flex items-center gap-3">
                <SidebarTrigger className="text-muted-foreground hover:text-foreground p-2 rounded-lg hover:bg-white/5 transition-colors">
                  <Menu className="h-5 w-5" />
                </SidebarTrigger>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleSignOut}
                  className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                >
                  <LogOut className="h-5 w-5" />
                </Button>
              </div>
              
              {/* Right side - greeting */}
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <h1 className="text-xl font-bold text-foreground">שלום, {userName} 👋</h1>
                  <p className="text-sm text-muted-foreground">הנה סקירה מהירה של הפעילות</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/20">
                  <Shield className="h-6 w-6 text-primary icon-glow" />
                </div>
              </div>
            </div>
          </header>
          
          {/* Main Content */}
          <div className="p-6 relative z-10">
            {children}
          </div>
        </main>
        
        <AppSidebar />
      </div>
    </SidebarProvider>
  );
}
