import { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { useAuth } from "@/hooks/useAuth";
import { PanelRight, Shield, Menu } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface MainLayoutProps {
  children: ReactNode;
}

function MainLayoutContent({ children }: MainLayoutProps) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const userName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "טל";

  return (
    <div className="min-h-screen flex w-full cyber-bg">
      <main className="flex-1 overflow-auto relative z-10">
        {/* Header */}
        <header className="sticky top-0 z-20 backdrop-blur-xl bg-background/40 border-b border-border/20 px-6 py-4">
          <div className="flex items-center justify-end gap-4">
            {/* Right side - greeting + menu trigger */}
            <div className="text-right">
              <h1 className="text-xl font-bold text-foreground">שלום, {userName} 👋</h1>
              <p className="text-sm text-muted-foreground">המערכת מנטרת ומגנה בזמן אמת</p>
            </div>
            <div className="w-12 h-12 rounded-xl icon-container flex items-center justify-center">
              <Shield className="h-6 w-6 text-primary icon-glow" />
            </div>
            <SidebarTrigger className="w-11 h-11 rounded-xl bg-primary/20 border border-primary/40 text-primary hover:bg-primary/30 hover:border-primary/60 transition-all shadow-[0_0_15px_hsl(200_100%_55%/0.3)] flex items-center justify-center">
              <Menu className="h-5 w-5" />
            </SidebarTrigger>
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