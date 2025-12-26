import { useState, useEffect, useCallback } from 'react';
import { Shield, Bell, AlertTriangle, CheckCircle, Filter } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { AlertDetailModal } from '@/components/alerts/AlertDetailModal';

interface Finding {
  id: string;
  child_id: string;
  scan_id: string;
  threat_detected: boolean;
  risk_level: string | null;
  threat_types: string[] | null;
  explanation: string | null;
  created_at: string;
  child_name?: string;
  handled?: boolean;
  handled_at?: string | null;
}

interface ChildOption {
  id: string;
  display_name: string;
}

export default function Alerts() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [findings, setFindings] = useState<Finding[]>([]);
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [children, setChildren] = useState<ChildOption[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [selectedChild, setSelectedChild] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('open');

  const fetchData = useCallback(async () => {
    if (!user) return;

    setLoading(true);

    // Fetch children
    const { data: childrenData } = await supabase
      .from('children')
      .select('id, display_name')
      .eq('user_id', user.id);

    if (childrenData) {
      setChildren(childrenData);

      // Fetch findings for all children
      const childIds = childrenData.map(c => c.id);
      
      if (childIds.length > 0) {
        const { data: findingsData } = await supabase
          .from('findings')
          .select('*')
          .in('child_id', childIds)
          .order('created_at', { ascending: false });

        if (findingsData) {
          // Map child names to findings
          const findingsWithNames = findingsData.map(f => ({
            ...f,
            threat_types: f.threat_types as string[] | null,
            child_name: childrenData.find(c => c.id === f.child_id)?.display_name || 'לא ידוע'
          }));
          setFindings(findingsWithNames);
        }
      }
    }

    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
      return;
    }

    fetchData();
  }, [user, authLoading, navigate, fetchData]);

  // Calculate stats
  const openFindings = findings.filter(f => f.threat_detected);
  const highRiskFindings = findings.filter(f => 
    f.threat_detected && (f.risk_level === 'high' || f.risk_level === 'critical')
  );
  const handledFindings = findings.filter(f => !f.threat_detected);

  // Apply filters
  const filteredFindings = findings.filter(f => {
    if (selectedChild !== 'all' && f.child_id !== selectedChild) return false;
    if (selectedStatus === 'open' && !f.threat_detected) return false;
    if (selectedStatus === 'handled' && f.threat_detected) return false;
    if (selectedType !== 'all' && !f.threat_types?.includes(selectedType)) return false;
    return true;
  });

  // Get unique threat types
  const allThreatTypes = [...new Set(findings.flatMap(f => f.threat_types || []))];

  if (authLoading || loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <Shield className="w-16 h-16 mx-auto mb-4 text-primary animate-pulse" />
            <p className="text-muted-foreground">טוען...</p>
          </div>
        </div>
      </Layout>
    );
  }

  const getRiskLevelStyle = (level: string | null) => {
    switch (level) {
      case 'critical':
        return 'badge-risk-critical';
      case 'high':
        return 'badge-risk-high';
      case 'medium':
        return 'badge-risk-medium';
      default:
        return 'badge-risk-low';
    }
  };

  const getRiskLevelText = (level: string | null) => {
    switch (level) {
      case 'critical':
        return 'קריטי';
      case 'high':
        return 'גבוה';
      case 'medium':
        return 'בינוני';
      default:
        return 'נמוך';
    }
  };

  return (
    <Layout>
      <div className="space-y-8 animate-slide-up">
        {/* Header */}
        <div>
          <h1 className="font-heebo text-3xl font-bold text-foreground">התראות</h1>
          <p className="text-muted-foreground mt-1">כל ההתראות שזוהו במערכת</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card variant="elevated">
            <CardContent className="p-6 flex items-center justify-between">
              <div className="flex flex-col items-center flex-1">
                <span className="text-4xl font-heebo font-bold text-warning">{openFindings.length}</span>
                <p className="text-sm text-muted-foreground mt-1">פתוחות</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-warning/20 flex items-center justify-center">
                <Bell className="w-6 h-6 text-warning" />
              </div>
            </CardContent>
          </Card>

          <Card variant="elevated">
            <CardContent className="p-6 flex items-center justify-between">
              <div className="flex flex-col items-center flex-1">
                <span className="text-4xl font-heebo font-bold text-destructive">{highRiskFindings.length}</span>
                <p className="text-sm text-muted-foreground mt-1">סיכון גבוה</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-destructive/20 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-destructive" />
              </div>
            </CardContent>
          </Card>

          <Card variant="elevated">
            <CardContent className="p-6 flex items-center justify-between">
              <div className="flex flex-col items-center flex-1">
                <span className="text-4xl font-heebo font-bold text-success">{handledFindings.length}</span>
                <p className="text-sm text-muted-foreground mt-1">טופלו</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-success/20 flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-success" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="glass-card p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Filter className="w-4 h-4" />
              <span className="text-sm">סינון:</span>
            </div>
            
            <Select value={selectedChild} onValueChange={setSelectedChild}>
              <SelectTrigger className="w-[180px] bg-input border-border">
                <SelectValue placeholder="כל הילדים" />
              </SelectTrigger>
              <SelectContent className="glass-card border-border">
                <SelectItem value="all">כל הילדים</SelectItem>
                {children.map(child => (
                  <SelectItem key={child.id} value={child.id}>{child.display_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger className="w-[180px] bg-input border-border">
                <SelectValue placeholder="כל הסוגים" />
              </SelectTrigger>
              <SelectContent className="glass-card border-border">
                <SelectItem value="all">כל הסוגים</SelectItem>
                {allThreatTypes.map(type => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-[180px] bg-input border-border">
                <SelectValue placeholder="סטטוס" />
              </SelectTrigger>
              <SelectContent className="glass-card border-border">
                <SelectItem value="all">הכל</SelectItem>
                <SelectItem value="open">פתוחות</SelectItem>
                <SelectItem value="handled">טופלו</SelectItem>
              </SelectContent>
            </Select>

            <div className="mr-auto text-sm text-muted-foreground">
              מציג {filteredFindings.length} מתוך {findings.length} התראות
            </div>
          </div>
        </div>

        {/* Findings List or Empty State */}
        {filteredFindings.length === 0 ? (
          <div className="glass-card p-16 text-center">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-success/10 flex items-center justify-center">
              <Shield className="w-10 h-10 text-success" />
            </div>
            <h3 className="font-heebo text-2xl font-bold mb-3 text-foreground">
              אין התראות פתוחות
            </h3>
            <p className="text-muted-foreground">
              כל ההתראות טופלו או שאין התראות חדשות
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredFindings.map((finding, index) => (
              <div
                key={finding.id}
                onClick={() => {
                  setSelectedFinding(finding);
                  setModalOpen(true);
                }}
                className={`glass-card p-6 cursor-pointer hover:border-primary/50 transition-all animate-enter animate-enter-${(index % 5) + 1}`}
              >
                <div className="flex items-center gap-4">
                  {/* Risk Icon */}
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    finding.risk_level === 'critical' || finding.risk_level === 'high' 
                      ? 'bg-destructive/20' 
                      : 'bg-warning/20'
                  }`}>
                    <AlertTriangle className={`w-6 h-6 ${
                      finding.risk_level === 'critical' || finding.risk_level === 'high' 
                        ? 'text-destructive' 
                        : 'text-warning'
                    }`} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-heebo font-bold text-foreground">
                        {finding.child_name}
                      </h3>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getRiskLevelStyle(finding.risk_level)}`}>
                        {getRiskLevelText(finding.risk_level)}
                      </span>
                    </div>
                    <p className="text-muted-foreground text-sm line-clamp-1">
                      {finding.explanation || 'אין הסבר זמין'}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      {finding.threat_types?.slice(0, 3).map(type => (
                        <span key={type} className="px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary">
                          {type}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Date */}
                  <div className="text-sm text-muted-foreground text-left flex-shrink-0">
                    {new Date(finding.created_at).toLocaleDateString('he-IL', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Alert Detail Modal */}
        <AlertDetailModal
          finding={selectedFinding}
          open={modalOpen}
          onOpenChange={setModalOpen}
          onUpdate={fetchData}
        />
      </div>
    </Layout>
  );
}
