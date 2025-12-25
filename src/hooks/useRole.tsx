import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { Database } from '@/integrations/supabase/types';

type AppRole = Database['public']['Enums']['app_role'];

interface RoleContextType {
  roles: AppRole[];
  activeRole: AppRole | null;
  setActiveRole: (role: AppRole) => void;
  loading: boolean;
  hasRole: (role: AppRole) => boolean;
  needsRoleSelection: boolean;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

export function RoleProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [activeRole, setActiveRoleState] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setRoles([]);
      setActiveRoleState(null);
      setLoading(false);
      return;
    }

    const fetchRoles = async () => {
      try {
        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id);

        if (error) throw error;

        const userRoles = data?.map(r => r.role) || [];
        setRoles(userRoles);

        // Check if there's a stored active role
        const storedRole = localStorage.getItem(`activeRole_${user.id}`);
        if (storedRole && userRoles.includes(storedRole as AppRole)) {
          setActiveRoleState(storedRole as AppRole);
        } else if (userRoles.length === 1) {
          // Auto-select if only one role
          setActiveRoleState(userRoles[0]);
          localStorage.setItem(`activeRole_${user.id}`, userRoles[0]);
        }
      } catch (error) {
        console.error('Error fetching roles:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchRoles();
  }, [user]);

  const setActiveRole = (role: AppRole) => {
    if (user && roles.includes(role)) {
      setActiveRoleState(role);
      localStorage.setItem(`activeRole_${user.id}`, role);
    }
  };

  const hasRole = (role: AppRole) => roles.includes(role);

  const needsRoleSelection = roles.length > 1 && !activeRole;

  return (
    <RoleContext.Provider value={{ 
      roles, 
      activeRole, 
      setActiveRole, 
      loading, 
      hasRole,
      needsRoleSelection 
    }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const context = useContext(RoleContext);
  if (context === undefined) {
    throw new Error('useRole must be used within a RoleProvider');
  }
  return context;
}
