import { Users, GraduationCap } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useRole } from '@/hooks/useRole';
import type { Database } from '@/integrations/supabase/types';

type AppRole = Database['public']['Enums']['app_role'];

interface RoleSelectorProps {
  onRoleSelected?: () => void;
}

export function RoleSelector({ onRoleSelected }: RoleSelectorProps) {
  const { roles, setActiveRole } = useRole();

  const handleSelectRole = (role: AppRole) => {
    setActiveRole(role);
    onRoleSelected?.();
  };

  const roleConfig = {
    parent: {
      icon: Users,
      title: 'היכנס כהורה',
      description: 'צפייה בהתראות הילדים שלי, קבלת עדכונים ושיתוף עם מורים',
      color: 'from-cyan-500 to-blue-600',
      shadowColor: 'shadow-cyan-500/30',
    },
    teacher: {
      icon: GraduationCap,
      title: 'היכנס כמורה',
      description: 'ניהול התראות תלמידים, מתן משוב להורים וטיפול באירועים',
      color: 'from-purple-500 to-pink-600',
      shadowColor: 'shadow-purple-500/30',
    },
    admin: {
      icon: Users,
      title: 'היכנס כמנהל',
      description: 'גישה מלאה לכל המערכת',
      color: 'from-orange-500 to-red-600',
      shadowColor: 'shadow-orange-500/30',
    },
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-heebo font-bold text-foreground mb-2">
            ברוכים הבאים ל-SafeKids
          </h1>
          <p className="text-muted-foreground">
            יש לך יותר מתפקיד אחד. באיזה תפקיד תרצה להיכנס?
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {roles.filter(role => role !== 'admin').map((role) => {
            const config = roleConfig[role];
            const Icon = config.icon;
            
            return (
              <Card 
                key={role}
                className="cursor-pointer transition-all duration-300 hover:scale-105 hover:shadow-xl border-2 border-transparent hover:border-primary/20"
                onClick={() => handleSelectRole(role)}
              >
                <CardHeader className="text-center pb-2">
                  <div className={`w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br ${config.color} flex items-center justify-center shadow-lg ${config.shadowColor} mb-4`}>
                    <Icon className="w-8 h-8 text-white" />
                  </div>
                  <CardTitle className="text-xl font-heebo">{config.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-center text-sm">
                    {config.description}
                  </CardDescription>
                  <Button 
                    className={`w-full mt-4 bg-gradient-to-r ${config.color} text-white border-0`}
                  >
                    המשך
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {roles.includes('admin') && (
          <div className="mt-6 text-center">
            <Button 
              variant="outline" 
              onClick={() => handleSelectRole('admin')}
              className="text-muted-foreground"
            >
              היכנס כמנהל מערכת
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
