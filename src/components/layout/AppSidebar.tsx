import { Home, Users, Bell, MessageCircle, GraduationCap, Settings, Shield, Sparkles } from "lucide-react";
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
    <Sidebar side="right" className="border-l border-sidebar-border bg-sidebar">
      {/* Logo Header */}
      <div className="p-5 border-b border-sidebar-border">
        <div className="flex items-center gap-3 justify-end">
          <div className="text-right">
            <h2 className="font-bold text-lg text-primary">SafeKids</h2>
            <p className="text-xs text-muted-foreground">Guardian</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center border border-primary/30">
            <Shield className="h-6 w-6 text-primary icon-glow" />
          </div>
        </div>
      </div>

      {/* Menu Items */}
      <SidebarContent className="py-4 px-3">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              {menuItems.map((item) => {
                const isActive = location.pathname === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild className="p-0">
                      <NavLink
                        to={item.url}
                        className={cn(
                          "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 justify-end w-full",
                          isActive
                            ? "sidebar-active text-white font-medium"
                            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        )}
                      >
                        <span className={cn(
                          "text-sm",
                          isActive ? "font-semibold" : "font-medium"
                        )}>
                          {item.title}
                        </span>
                        <item.icon className={cn(
                          "h-5 w-5",
                          isActive && "icon-glow"
                        )} />
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer */}
      <SidebarFooter className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3 justify-center">
          <div className="text-center">
            <p className="text-primary font-semibold text-sm">SafeKids Guardian</p>
            <p className="text-xs text-muted-foreground">הגנה חכמה על ילדים</p>
          </div>
          <Sparkles className="h-5 w-5 text-primary/60" />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
