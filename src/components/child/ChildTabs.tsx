import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  LayoutDashboard, 
  Upload, 
  Scan, 
  AlertTriangle, 
  TrendingUp, 
  History, 
  Settings,
  Link2
} from 'lucide-react';
import { OverviewTab } from './tabs/OverviewTab';
import { ImportTab } from './tabs/ImportTab';
import { ScanTab } from './tabs/ScanTab';
import { FindingsTab } from './tabs/FindingsTab';
import { PatternsTab } from './tabs/PatternsTab';
import { HistoryTab } from './tabs/HistoryTab';
import { SettingsTab } from './tabs/SettingsTab';
import { ConnectorTab } from './tabs/ConnectorTab';
import { Child } from '@/types/database';

interface ChildTabsProps {
  child: Child;
  onRefresh: () => void;
}

export function ChildTabs({ child, onRefresh }: ChildTabsProps) {
  return (
    <Tabs defaultValue="overview" className="w-full" dir="rtl">
      <TabsList className="glass-card w-full justify-start gap-1 p-2 h-auto flex-wrap mb-6">
        <TabsTrigger value="overview" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
          <LayoutDashboard className="w-4 h-4" />
          סקירה כללית
        </TabsTrigger>
        <TabsTrigger value="import" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
          <Upload className="w-4 h-4" />
          ייבוא נתונים
        </TabsTrigger>
        <TabsTrigger value="connector" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
          <Link2 className="w-4 h-4" />
          חיבור WhatsApp
        </TabsTrigger>
        <TabsTrigger value="scan" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
          <Scan className="w-4 h-4" />
          סריקה
        </TabsTrigger>
        <TabsTrigger value="findings" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
          <AlertTriangle className="w-4 h-4" />
          ממצאים
        </TabsTrigger>
        <TabsTrigger value="patterns" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
          <TrendingUp className="w-4 h-4" />
          דפוסים
        </TabsTrigger>
        <TabsTrigger value="history" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
          <History className="w-4 h-4" />
          היסטוריה
        </TabsTrigger>
        <TabsTrigger value="settings" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
          <Settings className="w-4 h-4" />
          הגדרות
        </TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="animate-slide-up">
        <OverviewTab child={child} />
      </TabsContent>

      <TabsContent value="import" className="animate-slide-up">
        <ImportTab child={child} onImportComplete={onRefresh} />
      </TabsContent>

      <TabsContent value="connector" className="animate-slide-up">
        <ConnectorTab child={child} onUpdate={onRefresh} />
      </TabsContent>

      <TabsContent value="scan" className="animate-slide-up">
        <ScanTab child={child} onScanComplete={onRefresh} />
      </TabsContent>

      <TabsContent value="findings" className="animate-slide-up">
        <FindingsTab child={child} />
      </TabsContent>

      <TabsContent value="patterns" className="animate-slide-up">
        <PatternsTab child={child} />
      </TabsContent>

      <TabsContent value="history" className="animate-slide-up">
        <HistoryTab child={child} />
      </TabsContent>

      <TabsContent value="settings" className="animate-slide-up">
        <SettingsTab child={child} onUpdate={onRefresh} />
      </TabsContent>
    </Tabs>
  );
}
