import { Home, Users, Bell, LayoutDashboard, Settings, Shield, Star, Heart } from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useLocation } from 'react-router-dom';
import { useRole } from '@/hooks/useRole';

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
} from '@/components/ui/sidebar';

type MenuItem = { title: string; url: string; icon: any };

const baseMenuItems: MenuItem[] = [
  { title: 'ראשי', url: '/', icon: Home },
  { title: 'הילדים שלי', url: '/children', icon: Users },
  { title: 'התראות', url: '/alerts', icon: Bell },
  { title: 'פורום הורים', url: '/forum', icon: Heart },
  { title: 'הגדרות', url: '/settings', icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const currentPath = location.pathname;
  const { hasRole } = useRole();

  const menuItems: MenuItem[] = [
    ...baseMenuItems,
    ...(hasRole('teacher') ? [{ title: 'דשבורד מורים', url: '/teacher-portal', icon: LayoutDashboard }] : []),
  ];

  const isActive = (path: string) => {
    if (path === '/') return currentPath === '/';
    return currentPath.startsWith(path);
  };

  return (
    <Sidebar
      className={`${collapsed ? 'w-16' : 'w-64'} transition-all duration-300 border-l border-sidebar-border bg-sidebar`}
      collapsible="icon"
      side="right"
    >
      <SidebarContent className="py-6">
        {/* Logo */}
        <div className={`px-4 mb-8 ${collapsed ? 'text-center' : ''}`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/30">
              <Shield className="w-5 h-5 text-white" />
            </div>
            {!collapsed && (
              <div className="flex flex-col">
                <span className="font-heebo font-bold text-lg text-foreground">SafeKids</span>
                <span className="text-xs text-sidebar-foreground">Guardian</span>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                        isActive(item.url)
                          ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/30'
                          : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground'
                      }`}
                      activeClassName=""
                    >
                      <item.icon className="w-5 h-5 flex-shrink-0" />
                      {!collapsed && <span className="font-assistant">{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer */}
      <SidebarFooter className="p-4 border-t border-sidebar-border">
        <div className={`flex items-center gap-3 ${collapsed ? 'justify-center' : ''}`}>
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center">
            <Star className="w-5 h-5 text-white" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="font-heebo font-semibold text-sm text-foreground">SafeKids Guardian</span>
              <span className="text-xs text-sidebar-foreground">הגנה דיגיטלית לילדים</span>
            </div>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
