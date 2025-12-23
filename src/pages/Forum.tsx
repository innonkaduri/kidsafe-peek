import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Shield, Send, MessageCircle, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { he } from "date-fns/locale";
import { toast } from "sonner";

interface ForumMessage {
  id: string;
  user_id: string;
  user_name: string;
  content: string;
  created_at: string;
}

export default function Forum() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ForumMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loadingData, setLoadingData] = useState(true);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) {
      fetchMessages();
      setupRealtime();
    }
  }, [user]);

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
              .select("full_name")
              .eq("id", msg.user_id)
              .single();

            return {
              ...msg,
              user_name: profile?.full_name || "הורה אנונימי",
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
            .select("full_name")
            .eq("id", newMsg.user_id)
            .single();

          setMessages((prev) => [
            ...prev,
            {
              ...newMsg,
              user_name: profile?.full_name || "הורה אנונימי",
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
      <div className="h-[calc(100vh-180px)] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm text-muted-foreground">
            {messages.length} הודעות
          </div>
          <h1 className="text-2xl font-bold">פורום הורים</h1>
        </div>

        <Card className="glass-card flex-1 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-border/50 text-right">
            <div className="flex items-center gap-2 justify-end">
              <div>
                <p className="font-semibold">קהילת ההורים</p>
                <p className="text-xs text-muted-foreground">
                  שתפו מידע ודרכי התמודדות עם הורים אחרים
                </p>
              </div>
              <MessageCircle className="h-5 w-5 text-primary" />
            </div>
          </div>

          <ScrollArea className="flex-1 p-4" ref={scrollRef}>
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
                    <div
                      key={msg.id}
                      className={`flex ${isOwn ? "justify-start" : "justify-end"}`}
                    >
                      <div
                        className={`max-w-[70%] p-3 rounded-2xl ${
                          isOwn
                            ? "bg-primary text-primary-foreground rounded-bl-sm"
                            : "bg-muted rounded-br-sm"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1 justify-end">
                          <span className="text-xs opacity-70">{msg.user_name}</span>
                          <User className="h-3 w-3 opacity-70" />
                        </div>
                        <p className="text-sm text-right">{msg.content}</p>
                        <p className="text-xs opacity-50 mt-1 text-left">
                          {formatDistanceToNow(new Date(msg.created_at), {
                            addSuffix: true,
                            locale: he,
                          })}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>

          <div className="p-4 border-t border-border/50">
            <div className="flex gap-2">
              <Button
                onClick={sendMessage}
                disabled={!newMessage.trim() || sending}
                className="btn-glow"
              >
                <Send className="h-4 w-4" />
              </Button>
              <Input
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="כתבו הודעה..."
                className="flex-1 text-right"
                disabled={sending}
              />
            </div>
          </div>
        </Card>
      </div>
    </MainLayout>
  );
}
