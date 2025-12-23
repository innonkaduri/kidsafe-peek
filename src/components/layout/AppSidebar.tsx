import { Home, Users, Bell, MessageCircle, GraduationCap, Settings } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";

const menuItems = [
  { title: "ראשי", url: "/", icon: Home },
  { title: "הילדים שלי", url: "/my-children", icon: Users },
  { title: "התראות", url: "/alerts", icon: Bell },
  { title: "פורום הורים", url: "/forum", icon: MessageCircle },
  { title: "דשבורד מורים", url: "/teachers", icon: GraduationCap },
  { title: "הגדרות", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const location = useLocation();

  return (
    <Sidebar side="right" className="border-l border-border/50 bg-sidebar-background">
      <div className="p-4 border-b border-border/50">
        <div className="flex items-center gap-3 justify-end">
          <div className="text-right">
            <h2 className="font-bold text-lg text-primary">SafeKids</h2>
            <p className="text-xs text-muted-foreground">Guardian</p>
          </div>
          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
            <span className="text-primary text-lg">🛡️</span>
          </div>
        </div>
      </div>

      <SidebarContent className="py-4">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => {
                const isActive = location.pathname === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        className={cn(
                          "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 justify-end",
                          isActive
                            ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30"
                            : "text-sidebar-foreground hover:bg-sidebar-accent"
                        )}
                      >
                        <span className="font-medium">{item.title}</span>
                        <item.icon className="h-5 w-5" />
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-border/50">
        <div className="text-center">
          <p className="text-primary font-semibold text-sm">SafeKids Guardian</p>
          <p className="text-xs text-muted-foreground">הגנה חכמה על ילדים</p>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
