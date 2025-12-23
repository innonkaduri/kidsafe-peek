import { useState, useCallback } from 'react';
import { Upload, FileArchive, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Child } from '@/types/database';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ImportTabProps {
  child: Child;
  onImportComplete: () => void;
}

interface ParsedChat {
  name: string;
  messages: ParsedMessage[];
}

interface ParsedMessage {
  sender: string;
  timestamp: string;
  content: string;
  type: 'text' | 'image' | 'audio' | 'video' | 'file';
  isChild: boolean;
}

export function ImportTab({ child, onImportComplete }: ImportTabProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'processing' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<{ chats: number; messages: number; media: number } | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const processFile = async (file: File) => {
    setUploading(true);
    setStatus('uploading');
    setProgress(10);

    try {
      // Create import record
      const { data: importRecord, error: importError } = await supabase
        .from('imports')
        .insert({
          child_id: child.id,
          filename: file.name,
          file_size: file.size,
          status: 'processing',
        })
        .select()
        .single();

      if (importError) throw importError;

      setProgress(30);
      setStatus('processing');

      // Simulate parsing (in real app, would parse the zip file)
      await new Promise(resolve => setTimeout(resolve, 1500));
      setProgress(50);

      // Generate mock data for demo
      const mockChats = generateMockChats(child.id, importRecord.id);
      
      // Insert chats
      for (const chat of mockChats.chats) {
        const { data: chatData, error: chatError } = await supabase
          .from('chats')
          .insert({
            child_id: child.id,
            import_id: importRecord.id,
            chat_name: chat.name,
            participant_count: chat.participantCount,
            is_group: chat.isGroup,
            last_message_at: chat.lastMessageAt,
          })
          .select()
          .single();

        if (chatError) throw chatError;

        // Insert messages
        if (chatData) {
          for (const msg of chat.messages) {
            await supabase.from('messages').insert({
              child_id: child.id,
              chat_id: chatData.id,
              sender_label: msg.sender,
              is_child_sender: msg.isChild,
              msg_type: msg.type,
              message_timestamp: msg.timestamp,
              text_content: msg.content,
              text_excerpt: msg.content?.substring(0, 100),
            });
          }
        }
      }

      setProgress(90);

      // Update import record
      await supabase
        .from('imports')
        .update({
          status: 'completed',
          chats_count: mockChats.chats.length,
          messages_count: mockChats.totalMessages,
          media_count: mockChats.mediaCount,
          completed_at: new Date().toISOString(),
        })
        .eq('id', importRecord.id);

      setProgress(100);
      setStatus('done');
      setResult({
        chats: mockChats.chats.length,
        messages: mockChats.totalMessages,
        media: mockChats.mediaCount,
      });

      toast.success('הייבוא הושלם בהצלחה!');
      onImportComplete();
    } catch (error: any) {
      console.error('Import error:', error);
      setStatus('error');
      toast.error('שגיאה בייבוא: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      processFile(files[0]);
    }
  }, [child.id]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  const resetUpload = () => {
    setStatus('idle');
    setProgress(0);
    setResult(null);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-primary" />
            ייבוא שיחות
          </CardTitle>
          <CardDescription>
            העלו קובץ ייצוא של שיחות (ZIP) מהמכשיר של הילד/ה
          </CardDescription>
        </CardHeader>
        <CardContent>
          {status === 'idle' && (
            <div
              className={`relative border-2 border-dashed rounded-xl p-12 text-center transition-all duration-300 ${
                isDragging 
                  ? 'border-primary bg-primary/10' 
                  : 'border-border hover:border-primary/50'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <input
                type="file"
                accept=".zip,.txt,.json"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                onChange={handleFileSelect}
              />
              <FileArchive className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="font-heebo font-bold text-lg mb-2">גררו קובץ לכאן</h3>
              <p className="text-sm text-muted-foreground mb-4">
                או לחצו לבחירת קובץ
              </p>
              <p className="text-xs text-muted-foreground">
                תומך בקבצי ZIP, TXT, JSON
              </p>
            </div>
          )}

          {(status === 'uploading' || status === 'processing') && (
            <div className="text-center py-12">
              <Loader2 className="w-16 h-16 mx-auto mb-4 text-primary animate-spin" />
              <h3 className="font-heebo font-bold text-lg mb-4">
                {status === 'uploading' ? 'מעלה קובץ...' : 'מעבד נתונים...'}
              </h3>
              <Progress value={progress} className="max-w-xs mx-auto" />
              <p className="text-sm text-muted-foreground mt-2">{progress}%</p>
            </div>
          )}

          {status === 'done' && result && (
            <div className="text-center py-12">
              <CheckCircle className="w-16 h-16 mx-auto mb-4 text-success" />
              <h3 className="font-heebo font-bold text-lg mb-4">הייבוא הושלם!</h3>
              <div className="grid grid-cols-3 gap-4 max-w-sm mx-auto mb-6">
                <div className="glass-card p-4 rounded-xl">
                  <span className="text-2xl font-bold text-primary">{result.chats}</span>
                  <p className="text-sm text-muted-foreground">שיחות</p>
                </div>
                <div className="glass-card p-4 rounded-xl">
                  <span className="text-2xl font-bold text-cyan-400">{result.messages}</span>
                  <p className="text-sm text-muted-foreground">הודעות</p>
                </div>
                <div className="glass-card p-4 rounded-xl">
                  <span className="text-2xl font-bold text-warning">{result.media}</span>
                  <p className="text-sm text-muted-foreground">מדיה</p>
                </div>
              </div>
              <Button onClick={resetUpload} variant="outline">
                ייבוא נוסף
              </Button>
            </div>
          )}

          {status === 'error' && (
            <div className="text-center py-12">
              <AlertCircle className="w-16 h-16 mx-auto mb-4 text-destructive" />
              <h3 className="font-heebo font-bold text-lg mb-4">שגיאה בייבוא</h3>
              <p className="text-sm text-muted-foreground mb-6">
                אירעה שגיאה בעיבוד הקובץ. נסו שוב.
              </p>
              <Button onClick={resetUpload} variant="glow">
                נסה שוב
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Mock data generator for demo
function generateMockChats(childId: string, importId: string) {
  const now = new Date();
  const chats = [
    {
      name: 'דני - חבר מהכיתה',
      participantCount: 2,
      isGroup: false,
      lastMessageAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
      messages: [
        { sender: 'דני', isChild: false, type: 'text' as const, timestamp: new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString(), content: 'היי, מה קורה?' },
        { sender: 'הילד', isChild: true, type: 'text' as const, timestamp: new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString(), content: 'הכל טוב, עושה שיעורים' },
        { sender: 'דני', isChild: false, type: 'text' as const, timestamp: new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString(), content: 'בוא נשחק אחר כך?' },
      ],
    },
    {
      name: 'קבוצת הכיתה',
      participantCount: 25,
      isGroup: true,
      lastMessageAt: new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString(),
      messages: [
        { sender: 'המורה', isChild: false, type: 'text' as const, timestamp: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(), content: 'שיעורי בית לשבוע הבא' },
        { sender: 'ילד אחר', isChild: false, type: 'text' as const, timestamp: new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString(), content: 'מישהו יודע מתי המבחן?' },
      ],
    },
    {
      name: 'מישהו לא מוכר',
      participantCount: 2,
      isGroup: false,
      lastMessageAt: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
      messages: [
        { sender: 'זר', isChild: false, type: 'text' as const, timestamp: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(), content: 'היי יפה/יפה, רוצה להכיר?' },
        { sender: 'הילד', isChild: true, type: 'text' as const, timestamp: new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString(), content: 'מי זה?' },
        { sender: 'זר', isChild: false, type: 'text' as const, timestamp: new Date(now.getTime() - 30 * 60 * 1000).toISOString(), content: 'לא משנה, תשלחי תמונה?' },
      ],
    },
  ];

  return {
    chats,
    totalMessages: chats.reduce((sum, chat) => sum + chat.messages.length, 0),
    mediaCount: 0,
  };
}
