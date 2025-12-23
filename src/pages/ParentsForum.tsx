import { useState, useEffect, useCallback, useRef } from 'react';
import { Shield, Heart, Lightbulb, Lock, Send, Edit2, Check, X, MessageCircle } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

interface ForumMessage {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  user_name?: string;
  user_email?: string;
}

interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
}

export default function ParentsForum() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ForumMessage[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [myProfile, setMyProfile] = useState<Profile | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchData = useCallback(async () => {
    if (!user) return;

    setLoading(true);

    // Fetch my profile
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (profileData) {
      setMyProfile(profileData);
      setNewName(profileData.full_name || '');
    }

    // Fetch all messages
    const { data: messagesData } = await supabase
      .from('forum_messages')
      .select('*')
      .order('created_at', { ascending: true });

    if (messagesData) {
      // Get unique user IDs
      const userIds = [...new Set(messagesData.map(m => m.user_id))];
      
      // Fetch profiles for all users
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds);

      if (profilesData) {
        const profilesMap: Record<string, Profile> = {};
        profilesData.forEach(p => {
          profilesMap[p.id] = p;
        });
        setProfiles(profilesMap);
      }

      setMessages(messagesData);
    }

    setLoading(false);
    setTimeout(scrollToBottom, 100);
  }, [user]);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
      return;
    }

    fetchData();
  }, [user, authLoading, navigate, fetchData]);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('forum-messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'forum_messages'
        },
        async (payload) => {
          const newMsg = payload.new as ForumMessage;
          
          // Fetch profile if not already have it
          if (!profiles[newMsg.user_id]) {
            const { data: profileData } = await supabase
              .from('profiles')
              .select('id, full_name, email')
              .eq('id', newMsg.user_id)
              .maybeSingle();
            
            if (profileData) {
              setProfiles(prev => ({ ...prev, [newMsg.user_id]: profileData }));
            }
          }
          
          setMessages(prev => [...prev, newMsg]);
          setTimeout(scrollToBottom, 100);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profiles]);

  const handleSendMessage = async () => {
    if (!user || !newMessage.trim()) return;

    setSending(true);

    const { error } = await supabase
      .from('forum_messages')
      .insert({
        user_id: user.id,
        content: newMessage.trim()
      });

    if (error) {
      toast.error('שגיאה בשליחת ההודעה');
    } else {
      setNewMessage('');
    }

    setSending(false);
  };

  const handleUpdateName = async () => {
    if (!user || !newName.trim()) return;

    const { error } = await supabase
      .from('profiles')
      .update({ full_name: newName.trim() })
      .eq('id', user.id);

    if (error) {
      toast.error('שגיאה בעדכון השם');
    } else {
      setMyProfile(prev => prev ? { ...prev, full_name: newName.trim() } : null);
      setProfiles(prev => ({
        ...prev,
        [user.id]: { ...prev[user.id], full_name: newName.trim() }
      }));
      setEditingName(false);
      toast.success('השם עודכן בהצלחה');
    }
  };

  const getUserDisplayName = (userId: string) => {
    const profile = profiles[userId];
    return profile?.full_name || profile?.email?.split('@')[0] || 'משתמש';
  };

  const getInitial = (userId: string) => {
    const name = getUserDisplayName(userId);
    return name.charAt(0).toUpperCase();
  };

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

  const features = [
    {
      icon: Lock,
      title: 'סביבה בטוחה',
      description: 'שיחות פרטיות, ללא שיפוט, עם שמירה מלאה על פרטיות',
      color: 'from-cyan-400 to-blue-500'
    },
    {
      icon: Lightbulb,
      title: 'ייעוץ מעשי',
      description: 'כלים והדרכה ספציפית להתמודדות עם חרם ובריונות',
      color: 'from-purple-400 to-pink-500'
    },
    {
      icon: Heart,
      title: 'תמיכה רגשית',
      description: 'אתם לא לבד - קבלו חיזוק, הבנה וליווי במסע',
      color: 'from-pink-400 to-rose-500'
    }
  ];

  return (
    <Layout>
      <div className="space-y-8 animate-slide-up">
        {/* Header */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Heart className="w-6 h-6 text-pink-400" />
            <h1 className="font-heebo text-3xl font-bold text-foreground">פורום הורים - תמיכה והדרכה</h1>
          </div>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            מרחב בטוח להורים לילדים שחווים חרם, בריונות או הטרדה ברשת. קבלו תמיכה, ייעוץ וכלים מעשיים מהסוכן החכם שלנו.
          </p>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {features.map((feature, index) => (
            <div
              key={index}
              className={`glass-card p-6 text-center animate-enter animate-enter-${index + 1}`}
            >
              <div className={`w-14 h-14 mx-auto mb-4 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center shadow-lg`}>
                <feature.icon className="w-7 h-7 text-white" />
              </div>
              <h3 className="font-heebo font-bold text-lg text-foreground mb-2">{feature.title}</h3>
              <p className="text-sm text-muted-foreground">{feature.description}</p>
            </div>
          ))}
        </div>

        {/* Chat Section */}
        <div className="glass-card overflow-hidden">
          {/* Chat Header */}
          <div className="p-6 border-b border-border/50 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center">
                <MessageCircle className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="font-heebo font-bold text-lg text-foreground">צ'אט קהילת ההורים</h2>
                <p className="text-sm text-muted-foreground">שתפו, תמכו והתחברו להורים אחרים</p>
              </div>
            </div>
            
            {/* User Profile Section */}
            <div className="flex items-center gap-3">
              {editingName ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-40 h-9 bg-input border-border"
                    placeholder="שם התצוגה שלך"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-success hover:bg-success/20"
                    onClick={handleUpdateName}
                  >
                    <Check className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive hover:bg-destructive/20"
                    onClick={() => setEditingName(false)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="text-left">
                    <p className="font-medium text-foreground">{myProfile?.full_name || 'הגדר שם'}</p>
                    <p className="text-xs text-muted-foreground">{myProfile?.email}</p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    onClick={() => setEditingName(true)}
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                </div>
              )}
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center">
                <span className="text-sm font-bold text-white">
                  {getInitial(user?.id || '')}
                </span>
              </div>
            </div>
          </div>

          {/* Message Count Badge */}
          <div className="px-6 py-3 border-b border-border/50">
            <span className="px-3 py-1 rounded-full text-xs bg-success/20 text-success">
              {messages.length} הודעות
            </span>
          </div>

          {/* Messages Area */}
          <div className="h-[400px] overflow-y-auto p-6 space-y-4">
            {messages.length === 0 ? (
              <div className="text-center py-12">
                <MessageCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">היו הראשונים לשתף בקהילה</p>
              </div>
            ) : (
              messages.map((message) => {
                const isOwn = message.user_id === user?.id;
                const displayName = getUserDisplayName(message.user_id);
                
                return (
                  <div
                    key={message.id}
                    className={`flex items-start gap-3 ${isOwn ? 'flex-row' : 'flex-row-reverse'}`}
                  >
                    {/* Avatar */}
                    <div className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center ${
                      isOwn 
                        ? 'bg-gradient-to-br from-cyan-400 to-blue-600' 
                        : 'bg-gradient-to-br from-purple-400 to-pink-500'
                    }`}>
                      <span className="text-sm font-bold text-white">
                        {getInitial(message.user_id)}
                      </span>
                    </div>

                    {/* Message Content */}
                    <div className={`flex-1 max-w-[70%] ${isOwn ? '' : 'text-left'}`}>
                      {/* User Info */}
                      <div className={`flex items-center gap-2 mb-1 ${isOwn ? '' : 'flex-row-reverse justify-end'}`}>
                        <span className="font-medium text-foreground text-sm">{displayName}</span>
                        {isOwn && (
                          <span className="px-2 py-0.5 rounded text-xs bg-primary/20 text-primary">אתה</span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {new Date(message.created_at).toLocaleString('he-IL', {
                            hour: '2-digit',
                            minute: '2-digit',
                            day: '2-digit',
                            month: '2-digit'
                          })}
                        </span>
                      </div>

                      {/* Message Bubble */}
                      <div className={`p-4 rounded-2xl ${
                        isOwn 
                          ? 'bg-gradient-to-r from-cyan-500/30 to-blue-500/30 border border-cyan-500/30' 
                          : 'bg-muted/50 border border-border/50'
                      }`}>
                        <p className="text-foreground">{message.content}</p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-4 border-t border-border/50">
            <div className="flex gap-3">
              <Input
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                placeholder="כתבו הודעה לקהילה..."
                className="flex-1 bg-input border-border"
                disabled={sending}
              />
              <Button
                onClick={handleSendMessage}
                disabled={sending || !newMessage.trim()}
                variant="glow"
                className="px-6"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
