import { Shield, LogOut, User, Bell, Settings, Users, GraduationCap, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import { Link, useNavigate } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';

export function Header() {
  const { user, signOut } = useAuth();
  const { roles, activeRole, setActiveRole, hasRole } = useRole();
  const navigate = useNavigate();
  
  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'teacher': return <GraduationCap className="w-4 h-4" />;
      case 'parent': return <Users className="w-4 h-4" />;
      default: return <User className="w-4 h-4" />;
    }
  };
  
  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'teacher': return 'מורה';
      case 'parent': return 'הורה';
      case 'admin': return 'מנהל';
      default: return role;
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  return (
    <header className="fixed top-0 right-0 left-0 z-50 glass-card border-b border-border/50">
      <div className="container mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-cyan-500 flex items-center justify-center shadow-lg shadow-primary/30">
            <Shield className="w-5 h-5 text-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="font-heebo font-bold text-lg">SafeKids Guardian</span>
            <span className="text-xs text-muted-foreground font-assistant">הגנה חכמה למשפחה</span>
          </div>
        </Link>

        <nav className="flex items-center gap-4">
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1 left-1 w-2 h-2 bg-risk-critical rounded-full" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="glass" className="gap-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/30 to-cyan-500/30 flex items-center justify-center">
                  {activeRole ? getRoleIcon(activeRole) : <User className="w-4 h-4" />}
                </div>
                <div className="hidden sm:flex flex-col items-start">
                  <span className="font-assistant text-sm">
                    {user?.email?.split('@')[0] || 'משתמש'}
                  </span>
                  {activeRole && (
                    <span className="text-xs text-muted-foreground">
                      {getRoleLabel(activeRole)}
                    </span>
                  )}
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56 glass-card border-border">
              {/* Role switcher section */}
              {roles.length > 1 && (
                <>
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    החלף תפקיד
                  </DropdownMenuLabel>
                  {roles.map((role) => (
                    <DropdownMenuItem 
                      key={role}
                      onClick={() => {
                        setActiveRole(role);
                        if (role === 'teacher') {
                          navigate('/teacher-portal');
                        } else {
                          navigate('/');
                        }
                      }}
                      className={`flex items-center gap-2 cursor-pointer ${activeRole === role ? 'bg-primary/10' : ''}`}
                    >
                      {getRoleIcon(role)}
                      {getRoleLabel(role)}
                      {activeRole === role && (
                        <Badge variant="secondary" className="mr-auto text-xs">פעיל</Badge>
                      )}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                </>
              )}
              
              <DropdownMenuItem asChild>
                <Link to="/settings" className="flex items-center gap-2 cursor-pointer">
                  <Settings className="w-4 h-4" />
                  הגדרות
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/policy" className="flex items-center gap-2 cursor-pointer">
                  <Shield className="w-4 h-4" />
                  מדיניות פרטיות
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="text-destructive cursor-pointer">
                <LogOut className="w-4 h-4 ml-2" />
                התנתקות
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>
      </div>
    </header>
  );
}
