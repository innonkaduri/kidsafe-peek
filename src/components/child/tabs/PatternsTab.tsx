import { useEffect, useState } from 'react';
import { TrendingUp, MessageSquare, Eye, EyeOff, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Child, Pattern, Chat } from '@/types/database';
import { supabase } from '@/integrations/supabase/client';

interface PatternsTabProps {
  child: Child;
}

interface ChatWithPatterns extends Chat {
  patterns: Pattern[];
}

const patternLabels: Record<string, string> = {
  persistent_contact: 'קשר מתמשך',
  secrecy_request: 'בקשת סודיות',
  pressure_tactics: 'טקטיקות לחץ',
  age_inappropriate: 'תוכן לא מתאים לגיל',
  unknown_contact: 'איש קשר לא מוכר',
};

export function PatternsTab({ child }: PatternsTabProps) {
  const [chats, setChats] = useState<ChatWithPatterns[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchChatsWithPatterns();
  }, [child.id]);

  async function fetchChatsWithPatterns() {
    setLoading(true);
    
    // Fetch chats
    const { data: chatsData } = await supabase
      .from('chats')
      .select('*')
      .eq('child_id', child.id)
      .order('last_message_at', { ascending: false });

    if (chatsData) {
      // Fetch patterns for each chat
      const chatsWithPatterns = await Promise.all(
        chatsData.map(async (chat) => {
          const { data: patterns } = await supabase
            .from('patterns')
            .select('*')
            .eq('chat_id', chat.id);
          
          return {
            ...chat,
            patterns: patterns || [],
          };
        })
      );
      
      setChats(chatsWithPatterns);
    }
    
    setLoading(false);
  }

  const toggleWatchlist = async (chatId: string, currentValue: boolean) => {
    await supabase
      .from('chats')
      .update({ is_watchlisted: !currentValue })
      .eq('id', chatId);
    
    setChats(prev => 
      prev.map(chat => 
        chat.id === chatId 
          ? { ...chat, is_watchlisted: !currentValue }
          : chat
      )
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            דפוסים התנהגותיים
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-pulse">טוען דפוסים...</div>
            </div>
          ) : chats.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle className="w-16 h-16 mx-auto mb-4 text-success" />
              <h3 className="font-heebo font-bold text-xl mb-2">אין שיחות</h3>
              <p className="text-muted-foreground">יש לייבא שיחות תחילה</p>
            </div>
          ) : (
            <div className="space-y-4">
              {chats.map((chat) => (
                <div 
                  key={chat.id}
                  className={`glass-card p-4 rounded-xl flex items-center justify-between ${
                    chat.is_watchlisted ? 'border-r-4 border-r-warning' : ''
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center">
                      <MessageSquare className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <div>
                      <h4 className="font-medium">{chat.chat_name}</h4>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {chat.is_group && (
                          <Badge variant="secondary">קבוצה</Badge>
                        )}
                        {chat.patterns.map((pattern) => (
                          <Badge 
                            key={pattern.id} 
                            variant="warning"
                            className="text-xs"
                          >
                            {patternLabels[pattern.pattern_type] || pattern.pattern_type}
                            {pattern.confidence && (
                              <span className="mr-1 opacity-70">
                                ({Math.round((pattern.confidence as number) * 100)}%)
                              </span>
                            )}
                          </Badge>
                        ))}
                        {chat.patterns.length === 0 && (
                          <span className="text-xs text-muted-foreground">
                            לא זוהו דפוסים חשודים
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      {chat.is_watchlisted ? (
                        <Eye className="w-4 h-4 text-warning" />
                      ) : (
                        <EyeOff className="w-4 h-4 text-muted-foreground" />
                      )}
                      <span className="text-sm text-muted-foreground">מעקב</span>
                      <Switch
                        checked={chat.is_watchlisted}
                        onCheckedChange={() => toggleWatchlist(chat.id, chat.is_watchlisted)}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
