import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { 
  Shield, 
  Send, 
  MessageCircle, 
  Heart,
  Users,
  Sparkles,
  MessagesSquare,
  Edit3
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { toast } from "sonner";

interface ForumMessage {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  content: string;
  created_at: string;
}

interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
}

export default function Forum() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ForumMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loadingData, setLoadingData] = useState(true);
  const [sending, setSending] = useState(false);
  const [currentUserProfile, setCurrentUserProfile] = useState<Profile | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) {
      fetchCurrentUserProfile();
      fetchMessages();
      const cleanup = setupRealtime();
      return cleanup;
    }
  }, [user]);

  const fetchCurrentUserProfile = async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("id", user.id)
      .single();
    
    if (data) {
      setCurrentUserProfile(data);
    }
  };

  const fetchMessages = async () => {
    setLoadingData(true);
    try {
      const { data, error } = await supabase
        .from("forum_messages")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(100);

      if (error) throw error;

      if (data) {
        const messagesWithNames = await Promise.all(
          data.map(async (msg) => {
            const { data: profile } = await supabase
              .from("profiles")
              .select("full_name, email")
              .eq("id", msg.user_id)
              .single();

            return {
              ...msg,
              user_name: profile?.full_name || "הורה אנונימי",
              user_email: profile?.email || "",
            };
          })
        );
        setMessages(messagesWithNames);
        setTimeout(scrollToBottom, 100);
      }
    } catch (error) {
      console.error("Error fetching messages:", error);
    } finally {
      setLoadingData(false);
    }
  };

  const setupRealtime = () => {
    const channel = supabase
      .channel("forum-messages")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "forum_messages" },
        async (payload) => {
          const newMsg = payload.new as any;
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name, email")
            .eq("id", newMsg.user_id)
            .single();

          setMessages((prev) => [
            ...prev,
            {
              ...newMsg,
              user_name: profile?.full_name || "הורה אנונימי",
              user_email: profile?.email || "",
            },
          ]);
          setTimeout(scrollToBottom, 100);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !user) return;

    setSending(true);
    try {
      const { error } = await supabase.from("forum_messages").insert({
        user_id: user.id,
        content: newMessage.trim(),
      });

      if (error) throw error;

      setNewMessage("");
    } catch (error) {
      console.error("Error sending message:", error);
      toast.error("שגיאה בשליחת ההודעה");
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const getInitials = (name: string) => {
    return name.charAt(0).toUpperCase();
  };

  const getAvatarColor = (userId: string) => {
    const colors = [
      "bg-pink-500",
      "bg-purple-500",
      "bg-blue-500",
      "bg-teal-500",
      "bg-orange-500",
      "bg-green-500",
    ];
    const index = userId.charCodeAt(0) % colors.length;
    return colors[index];
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <Shield className="h-12 w-12 text-primary animate-pulse" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6" dir="rtl">
        {/* Header Section */}
        <div className="text-center py-6">
          <div className="flex items-center justify-center gap-2 mb-3">
            <Heart className="h-6 w-6 text-pink-500 fill-pink-500" />
            <h1 className="text-2xl font-bold bg-gradient-to-r from-pink-500 to-purple-500 bg-clip-text text-transparent">
              פורום הורים - תמיכה והדרכה
            </h1>
          </div>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            מרחב בטוח להורים לילדים שחווים חרם, בריונות או הטרדה ברשת. קבלו תמיכה, ייעוץ וכלים מעשיים מהסוכן החכם שלנו.
          </p>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="glass-card p-6 text-center">
            <div className="bg-pink-500/20 w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="h-7 w-7 text-pink-500" />
            </div>
            <h3 className="font-bold text-lg mb-2">תמיכה רגשית</h3>
            <p className="text-sm text-muted-foreground">
              אתם לא לבד - קבלו חיזוק, הבנה וליווי במסע
            </p>
          </Card>

          <Card className="glass-card p-6 text-center">
            <div className="bg-cyan-500/20 w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4">
              <Sparkles className="h-7 w-7 text-cyan-500" />
            </div>
            <h3 className="font-bold text-lg mb-2">ייעוץ מעשי</h3>
            <p className="text-sm text-muted-foreground">
              כלים והדרכה ספציפית להתמודדות עם חרם ובריונות
            </p>
          </Card>

          <Card className="glass-card p-6 text-center">
            <div className="bg-blue-500/20 w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4">
              <MessagesSquare className="h-7 w-7 text-blue-500" />
            </div>
            <h3 className="font-bold text-lg mb-2">סביבה בטוחה</h3>
            <p className="text-sm text-muted-foreground">
              שיחות פרטיות, ללא שיפוט, עם שמירה מלאה על פרטיות
            </p>
          </Card>
        </div>

        {/* Chat Section */}
        <Card className="glass-card overflow-hidden">
          {/* Chat Header */}
          <div className="p-4 border-b border-border/30 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-primary/20 w-10 h-10 rounded-full flex items-center justify-center">
                <Edit3 className="h-5 w-5 text-primary" />
              </div>
              <div className="text-right">
                <p className="font-semibold">{currentUserProfile?.full_name || "משתמש"}</p>
                <p className="text-xs text-muted-foreground">{currentUserProfile?.email || user?.email}</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <Badge variant="secondary" className="bg-cyan-500/20 text-cyan-400 border-0">
                {messages.length} הודעות
              </Badge>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="font-semibold">צ'אט קהילת ההורים</p>
                  <p className="text-xs text-muted-foreground">שתפו, תמכו והתחברו להורים אחרים</p>
                </div>
                <div className="bg-primary/20 w-12 h-12 rounded-full flex items-center justify-center">
                  <MessageCircle className="h-6 w-6 text-primary" />
                </div>
              </div>
            </div>
          </div>

          {/* Messages Area */}
          <div className="relative">
            <div className="absolute right-0 top-0 bottom-0 w-1 bg-gradient-to-b from-cyan-500/50 via-primary/50 to-pink-500/50" />
            
            <ScrollArea className="h-[400px] p-4 pr-6" ref={scrollRef}>
              {loadingData ? (
                <div className="flex items-center justify-center h-32">
                  <Shield className="h-8 w-8 text-primary animate-pulse" />
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <MessageCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>אין הודעות עדיין</p>
                  <p className="text-sm">היו הראשונים לשתף!</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((msg) => {
                    const isOwn = msg.user_id === user?.id;
                    return (
                      <div key={msg.id} className="relative">
                        {/* Timeline dot */}
                        <div className={`absolute -right-[22px] top-4 w-3 h-3 rounded-full border-2 border-background ${isOwn ? 'bg-primary' : 'bg-muted-foreground'}`} />
                        
                        <div className={`flex ${isOwn ? "justify-start" : "justify-end"} gap-3`}>
                          {isOwn && (
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${getAvatarColor(msg.user_id)}`}>
                              {getInitials(msg.user_name)}
                            </div>
                          )}
                          
                          <div className={`max-w-[60%] ${isOwn ? "order-2" : "order-1"}`}>
                            <div className={`flex items-center gap-2 mb-1 ${isOwn ? "justify-start" : "justify-end"}`}>
                              <span className="text-sm font-medium">{msg.user_name}</span>
                              {isOwn && (
                                <Badge variant="outline" className="text-xs py-0 px-1.5 border-primary/50 text-primary">
                                  אתה
                                </Badge>
                              )}
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(msg.created_at), "HH:mm ,dd.MM", { locale: he })}
                              </span>
                            </div>
                            <div
                              className={`p-3 rounded-xl ${
                                isOwn
                                  ? "bg-gradient-to-r from-cyan-600/80 to-cyan-700/80 text-white"
                                  : "bg-muted/50"
                              }`}
                            >
                              <p className="text-sm text-right">{msg.content}</p>
                            </div>
                          </div>

                          {!isOwn && (
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${getAvatarColor(msg.user_id)}`}>
                              {getInitials(msg.user_name)}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Input Area */}
          <div className="p-4 border-t border-border/30">
            <div className="flex gap-3 items-center">
              <Button
                onClick={sendMessage}
                disabled={!newMessage.trim() || sending}
                size="icon"
                className="bg-primary hover:bg-primary/90 rounded-full w-10 h-10 shrink-0"
              >
                <Send className="h-4 w-4" />
              </Button>
              <Input
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="שתפו את החוויה, שאלו שאלה או תנו תמיכה..."
                className="flex-1 text-right bg-background/50 border-border/50 rounded-full px-4"
                disabled={sending}
              />
            </div>
          </div>
        </Card>
      </div>
    </MainLayout>
  );
}
