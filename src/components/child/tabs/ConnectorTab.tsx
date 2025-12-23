import { useState, useEffect } from 'react';
import { Link2, Loader2, CheckCircle, XCircle, RefreshCw, Wifi } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Child } from '@/types/database';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ConnectorTabProps {
  child: Child;
  onUpdate: () => void;
}

interface ConnectorCredential {
  id: string;
  instance_id: string;
  token_encrypted: string;
  last_checked_at: string | null;
  data_source_id: string;
}

export function ConnectorTab({ child, onUpdate }: ConnectorTabProps) {
  const [credentials, setCredentials] = useState<ConnectorCredential | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);

  // Form fields
  const [instanceId, setInstanceId] = useState('');
  const [apiToken, setApiToken] = useState('');

  useEffect(() => {
    fetchCredentials();
  }, [child.id]);

  async function fetchCredentials() {
    setLoading(true);

    // First, get data source for this child with connector type
    const { data: dataSource } = await supabase
      .from('data_sources')
      .select('id')
      .eq('child_id', child.id)
      .eq('source_type', 'connector')
      .maybeSingle();

    if (dataSource) {
      const { data: creds } = await supabase
        .from('connector_credentials')
        .select('*')
        .eq('data_source_id', dataSource.id)
        .maybeSingle();

      if (creds) {
        setCredentials(creds);
        setInstanceId(creds.instance_id || '');
        setApiToken(creds.token_encrypted || '');
      }
    }

    setLoading(false);
  }

  const saveCredentials = async () => {
    if (!instanceId.trim() || !apiToken.trim()) {
      toast.error('נא למלא את כל השדות');
      return;
    }

    setSaving(true);

    try {
      // Create or get data source
      let dataSourceId = credentials?.data_source_id;

      if (!dataSourceId) {
        const { data: newDataSource, error: dsError } = await supabase
          .from('data_sources')
          .insert({
            child_id: child.id,
            source_type: 'connector',
            status: 'active',
          })
          .select('id')
          .single();

        if (dsError) throw dsError;
        dataSourceId = newDataSource.id;
      }

      // Save or update credentials
      if (credentials) {
        const { error } = await supabase
          .from('connector_credentials')
          .update({
            instance_id: instanceId.trim(),
            token_encrypted: apiToken.trim(),
          })
          .eq('id', credentials.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('connector_credentials')
          .insert({
            data_source_id: dataSourceId,
            instance_id: instanceId.trim(),
            token_encrypted: apiToken.trim(),
          });

        if (error) throw error;
      }

      toast.success('הפרטים נשמרו בהצלחה');
      fetchCredentials();
      onUpdate();
    } catch (error: any) {
      toast.error('שגיאה בשמירה: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    if (!instanceId.trim() || !apiToken.trim()) {
      toast.error('נא למלא את כל השדות');
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      // Test connection to Green API
      const response = await fetch(
        `https://api.green-api.com/waInstance${instanceId.trim()}/getStateInstance/${apiToken.trim()}`,
        { method: 'GET' }
      );

      if (!response.ok) {
        throw new Error('Connection failed');
      }

      const data = await response.json();
      
      if (data.stateInstance === 'authorized') {
        setTestResult('success');
        toast.success('החיבור תקין!');

        // Update last checked
        if (credentials) {
          await supabase
            .from('connector_credentials')
            .update({ last_checked_at: new Date().toISOString() })
            .eq('id', credentials.id);
        }
      } else {
        setTestResult('error');
        toast.error(`סטטוס: ${data.stateInstance}. נא לסרוק את קוד ה-QR ב-Green API`);
      }
    } catch (error: any) {
      setTestResult('error');
      toast.error('שגיאה בחיבור: ' + error.message);
    } finally {
      setTesting(false);
    }
  };

  const syncMessages = async () => {
    if (!instanceId.trim() || !apiToken.trim()) {
      toast.error('נא למלא את כל השדות');
      return;
    }

    setSyncing(true);

    try {
      const { data, error } = await supabase.functions.invoke('green-api-fetch', {
        body: {
          child_id: child.id,
          instance_id: instanceId.trim(),
          api_token: apiToken.trim(),
        },
      });

      if (error) throw error;

      if (data.error) {
        throw new Error(data.error);
      }

      toast.success(`נטענו ${data.messagesImported} הודעות מ-${data.chatsProcessed} שיחות`);
      onUpdate();
    } catch (error: any) {
      toast.error('שגיאה בסנכרון: ' + error.message);
    } finally {
      setSyncing(false);
    }
  };

  const webhookUrl = `https://qhsvmfnjoowexmyaqgrr.supabase.co/functions/v1/green-api-webhook`;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="w-5 h-5 text-primary" />
            חיבור Green API (WhatsApp)
          </CardTitle>
          <CardDescription>
            חברו את חשבון WhatsApp לקבלת הודעות בזמן אמת
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {loading ? (
            <div className="text-center py-8">
              <Loader2 className="w-8 h-8 mx-auto animate-spin text-primary" />
            </div>
          ) : (
            <>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="instanceId">Instance ID</Label>
                  <Input
                    id="instanceId"
                    value={instanceId}
                    onChange={(e) => setInstanceId(e.target.value)}
                    placeholder="לדוגמה: 1234567890"
                    dir="ltr"
                  />
                  <p className="text-xs text-muted-foreground">
                    ניתן למצוא ב-Green API Console
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="apiToken">API Token</Label>
                  <Input
                    id="apiToken"
                    type="password"
                    value={apiToken}
                    onChange={(e) => setApiToken(e.target.value)}
                    placeholder="הזינו את הטוקן"
                    dir="ltr"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={saveCredentials} variant="glow" disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  שמור פרטים
                </Button>
                <Button onClick={testConnection} variant="outline" disabled={testing}>
                  {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                  בדוק חיבור
                </Button>
                {testResult === 'success' && <Badge variant="success">מחובר</Badge>}
                {testResult === 'error' && <Badge variant="destructive">שגיאה</Badge>}
              </div>

              {credentials && (
                <div className="pt-4 border-t border-border space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium">סנכרון הודעות</h4>
                      <p className="text-sm text-muted-foreground">
                        טען הודעות קיימות מ-WhatsApp
                      </p>
                    </div>
                    <Button onClick={syncMessages} variant="outline" disabled={syncing}>
                      {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                      סנכרן עכשיו
                    </Button>
                  </div>

                  <div className="glass-card p-4 rounded-xl">
                    <h4 className="font-medium mb-2">Webhook URL</h4>
                    <p className="text-xs text-muted-foreground mb-2">
                      הגדירו את הכתובת הזו ב-Green API לקבלת הודעות בזמן אמת:
                    </p>
                    <code className="block p-2 bg-muted rounded text-xs break-all" dir="ltr">
                      {webhookUrl}
                    </code>
                  </div>

                  {credentials.last_checked_at && (
                    <p className="text-sm text-muted-foreground">
                      בדיקה אחרונה: {new Date(credentials.last_checked_at).toLocaleString('he-IL')}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>הוראות התקנה</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <ol className="list-decimal list-inside space-y-2 mr-4">
            <li>היכנסו ל-<a href="https://green-api.com" target="_blank" rel="noopener" className="text-primary hover:underline">green-api.com</a> וצרו חשבון</li>
            <li>צרו Instance חדש וסרקו את קוד ה-QR עם WhatsApp</li>
            <li>העתיקו את Instance ID ו-API Token לשדות למעלה</li>
            <li>הגדירו את Webhook URL בהגדרות ה-Instance</li>
            <li>לחצו "בדוק חיבור" לוודא שהכל עובד</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
