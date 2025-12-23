import { 
  Home, 
  Users, 
  Bell, 
  FileBarChart, 
  Radio, 
  Settings, 
  Shield, 
  Sparkles,
  X
} from "lucide-react";
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
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

const menuItems = [
  { title: "דשבורד", url: "/", icon: Home },
  { title: "הילדים שלי", url: "/my-children", icon: Users },
  { title: "התראות", url: "/alerts", icon: Bell },
  { title: "דוחות חכמים", url: "/forum", icon: FileBarChart },
  { title: "אירועים בזמן אמת", url: "/teachers", icon: Radio },
  { title: "הגדרות", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const location = useLocation();
  const { setOpen } = useSidebar();

  return (
    <Sidebar side="right" collapsible="offcanvas" className="border-l border-sidebar-border bg-sidebar">
      {/* Logo Header */}
      <div className="p-5 border-b border-sidebar-border">
        <div className="flex items-center gap-3 justify-between">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setOpen(false)}
            className="text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent rounded-lg h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <h2 className="font-bold text-lg text-primary">SafeKids</h2>
              <p className="text-xs text-sidebar-foreground/60">Guardian</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/25 to-primary/10 flex items-center justify-center border border-primary/25 shadow-[0_0_20px_hsl(200_100%_55%/0.2)]">
              <Shield className="h-6 w-6 text-primary icon-glow" />
            </div>
          </div>
        </div>
      </div>

      {/* Menu Items */}
      <SidebarContent className="py-5 px-3">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1.5">
              {menuItems.map((item) => {
                const isActive = location.pathname === item.url;
                const isRealtime = item.title === "אירועים בזמן אמת";
                
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild className="p-0">
                      <NavLink
                        to={item.url}
                        onClick={() => setOpen(false)}
                        className={cn(
                          "flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-200 justify-end w-full",
                          isActive
                            ? "sidebar-active text-white font-semibold"
                            : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        )}
                      >
                        <span className={cn(
                          "text-sm",
                          isActive ? "font-semibold" : "font-medium"
                        )}>
                          {item.title}
                        </span>
                        <div className="relative">
                          <item.icon className={cn(
                            "h-5 w-5",
                            isActive && "icon-glow"
                          )} />
                          {isRealtime && (
                            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_hsl(0_80%_55%)]" />
                          )}
                        </div>
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
          <Sparkles className="h-4 w-4 text-primary/50" />
          <p className="text-primary/80 font-medium text-sm">SafeKids Guardian</p>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}