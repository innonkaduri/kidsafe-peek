import { ReactNode } from 'react';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { Bell, User, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { user } = useAuth();
  const userName = user?.email?.split('@')[0] || 'משתמש';

  return (
    <SidebarProvider defaultOpen={true}>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        
        <div className="flex-1 flex flex-col min-h-screen">
          {/* Top Header */}
          <header className="h-16 border-b border-border/30 flex items-center justify-between px-6 bg-background/50 backdrop-blur-xl">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="text-foreground hover:bg-accent rounded-lg p-2">
                <Menu className="w-5 h-5" />
              </SidebarTrigger>
              <div className="flex items-center gap-2">
                <span className="text-2xl">👋</span>
                <div>
                  <h1 className="font-heebo text-xl font-bold text-foreground">שלום, {userName}</h1>
                  <p className="text-sm text-muted-foreground">הכנסתך מוזמנת של הפעילות</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" className="relative text-foreground">
                <Bell className="w-5 h-5" />
              </Button>
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center">
                <User className="w-5 h-5 text-white" />
              </div>
            </div>
          </header>
          
          {/* Main Content */}
          <main className="flex-1 p-6 overflow-auto">
            <div className="max-w-7xl mx-auto">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
