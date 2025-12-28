import { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

interface AlertMessage {
  id: string;
  alert_id: string;
  sender_type: string;
  sender_user_id: string;
  message: string;
  created_at: string;
  read_at: string | null;
}

interface TeacherChatSectionProps {
  alertId: string;
  userId: string;
  teacherEmail: string;
}

export function TeacherChatSection({ alertId, userId, teacherEmail }: TeacherChatSectionProps) {
  const [messages, setMessages] = useState<AlertMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchMessages();
    setupRealtimeSubscription();
  }, [alertId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const setupRealtimeSubscription = () => {
    const channel = supabase
      .channel(`parent-chat-${alertId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'teacher_alert_messages',
          filter: `alert_id=eq.${alertId}`
        },
        (payload) => {
          const newMsg = payload.new as AlertMessage;
          setMessages(prev => [...prev, newMsg]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const fetchMessages = async () => {
    try {
      const { data, error } = await supabase
        .from('teacher_alert_messages')
        .select('*')
        .eq('alert_id', alertId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim()) return;

    setSending(true);
    try {
      const { error } = await supabase
        .from('teacher_alert_messages')
        .insert({
          alert_id: alertId,
          sender_type: 'parent',
          sender_user_id: userId,
          message: newMessage.trim()
        });

      if (error) throw error;
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('שגיאה בשליחת ההודעה');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-3">
      <h4 className="font-heebo font-semibold text-foreground flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-primary" />
        שיחה עם המורה ({teacherEmail})
      </h4>
      
      <div className="border border-border rounded-xl overflow-hidden">
        {/* Messages area */}
        <div className="h-48 overflow-y-auto p-3 bg-background/30 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm">
              <p>אין הודעות עדיין</p>
              <p className="mt-1">שלח הודעה למורה</p>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.sender_type === 'parent' ? 'justify-start' : 'justify-end'}`}
              >
                <div
                  className={`max-w-[80%] p-2 rounded-lg ${
                    msg.sender_type === 'parent'
                      ? 'bg-primary/20 text-foreground'
                      : 'bg-muted text-foreground'
                  }`}
                >
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    {msg.sender_type === 'parent' ? 'את/ה' : 'המורה'}
                  </p>
                  <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {format(new Date(msg.created_at), 'HH:mm dd/MM', { locale: he })}
                  </p>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
        
        {/* Input area */}
        <div className="p-2 border-t border-border bg-card/30 flex gap-2">
          <Textarea
            placeholder="כתוב הודעה למורה..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            className="min-h-[40px] max-h-[80px] bg-background/50 flex-1 text-sm resize-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
          />
          <Button
            size="sm"
            onClick={handleSendMessage}
            disabled={sending || !newMessage.trim()}
            className="self-end"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
