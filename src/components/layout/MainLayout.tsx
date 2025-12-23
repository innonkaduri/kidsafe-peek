import { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { LogOut, PanelRight, Shield } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface MainLayoutProps {
  children: ReactNode;
}

function MainLayoutContent({ children }: MainLayoutProps) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { open } = useSidebar();

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  const userName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "טל";

  return (
    <div className="min-h-screen flex w-full cyber-bg">
      <main className="flex-1 overflow-auto relative z-10">
        {/* Header */}
        <header className="sticky top-0 z-20 backdrop-blur-xl bg-background/40 border-b border-border/20 px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Left side - toggle & logout */}
            <div className="flex items-center gap-2">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground p-2.5 rounded-xl hover:bg-white/5 transition-colors border border-transparent hover:border-primary/20">
                <PanelRight className="h-5 w-5" />
              </SidebarTrigger>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleSignOut}
                className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl"
              >
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
            
            {/* Right side - greeting */}
            <div className="flex items-center gap-4">
              <div className="text-right">
                <h1 className="text-xl font-bold text-foreground">שלום, {userName} 👋</h1>
                <p className="text-sm text-muted-foreground">המערכת מנטרת ומגנה בזמן אמת</p>
              </div>
              <div className="w-12 h-12 rounded-xl icon-container flex items-center justify-center">
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
  );
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <SidebarProvider defaultOpen={false}>
      <MainLayoutContent>{children}</MainLayoutContent>
    </SidebarProvider>
  );
}