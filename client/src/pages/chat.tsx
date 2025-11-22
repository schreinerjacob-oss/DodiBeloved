import { useState, useEffect, useRef } from 'react';
import { useDodi } from '@/contexts/DodiContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Toggle } from '@/components/ui/toggle';
import { Heart, Send, Image, Mic, Lock, Eye, EyeOff } from 'lucide-react';
import { getAllMessages, saveMessage } from '@/lib/storage';
import type { Message } from '@shared/schema';
import { nanoid } from 'nanoid';
import { useToast } from '@/hooks/use-toast';

export default function ChatPage() {
  const { userId, partnerId, isOnline } = useDodi();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [isDisappearing, setIsDisappearing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadMessages();
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const loadMessages = async () => {
    const allMessages = await getAllMessages();
    setMessages(allMessages);
  };

  const handleSend = async () => {
    if (!newMessage.trim() || !userId || !partnerId) return;

    setSending(true);
    try {
      const message: Message = {
        id: nanoid(),
        senderId: userId,
        recipientId: partnerId,
        content: newMessage,
        type: 'text',
        mediaUrl: null,
        isDisappearing,
        timestamp: new Date(),
      };

      await saveMessage(message);
      setMessages(prev => [...prev, message]);
      setNewMessage('');
      
      if (isDisappearing) {
        toast({
          title: "Disappearing message sent 👻",
          description: "Message will vanish after being read.",
        });
        setTimeout(() => {
          setMessages(prev => prev.filter(m => m.id !== message.id));
        }, 5000);
      }
    } catch (error) {
      toast({
        title: "Failed to send",
        description: "Could not send message. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const handleThinkingOfYou = async () => {
    toast({
      title: "💕",
      description: "Thinking of you sent",
    });
  };

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="flex items-center justify-between px-6 py-4 border-b bg-card/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-sage to-blush flex items-center justify-center">
            <Heart className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="font-medium text-foreground">my beloved</h2>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Lock className="w-3 h-3" />
              {isOnline ? 'Online' : 'Offline'} • Encrypted
            </p>
          </div>
        </div>

        <Button
          onClick={handleThinkingOfYou}
          size="icon"
          variant="ghost"
          className="text-accent hover:text-accent"
          data-testid="button-thinking-of-you"
        >
          <Heart className="w-5 h-5 animate-pulse-glow" />
        </Button>
      </div>

      <ScrollArea className="flex-1 p-6" ref={scrollRef as any}>
        <div className="space-y-4 max-w-3xl mx-auto">
          {messages.length === 0 && (
            <div className="text-center py-12 space-y-3">
              <div className="w-16 h-16 mx-auto rounded-full bg-sage/20 flex items-center justify-center">
                <Heart className="w-8 h-8 text-sage" />
              </div>
              <p className="text-muted-foreground">Start your first conversation</p>
            </div>
          )}

          {messages.map((message) => {
            const isSent = message.senderId === userId;
            return (
              <div
                key={message.id}
                className={`flex ${isSent ? 'justify-end' : 'justify-start'} animate-fade-in`}
                data-testid={`message-${message.id}`}
              >
                <Card
                  className={`max-w-[70%] p-4 ${
                    isSent
                      ? 'bg-sage/30 border-sage/40'
                      : 'bg-card border-card-border'
                  }`}
                >
                  <p className="text-sm leading-relaxed">{message.content}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </Card>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      <div className="border-t bg-card/50 p-4">
        <div className="max-w-3xl mx-auto flex items-center gap-2">
          <Button
            size="icon"
            variant="ghost"
            className="text-muted-foreground"
            data-testid="button-attach-image"
          >
            <Image className="w-5 h-5" />
          </Button>

          <Button
            size="icon"
            variant="ghost"
            className="text-muted-foreground"
            data-testid="button-voice-note"
          >
            <Mic className="w-5 h-5" />
          </Button>

          <Toggle
            pressed={isDisappearing}
            onPressedChange={setIsDisappearing}
            className="text-muted-foreground"
            data-testid="button-disappearing"
            title="Send disappearing message"
          >
            {isDisappearing ? (
              <EyeOff className="w-5 h-5 text-accent" />
            ) : (
              <Eye className="w-5 h-5" />
            )}
          </Toggle>

          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Type a message..."
            className="flex-1"
            disabled={sending}
            data-testid="input-message"
          />

          <Button
            onClick={handleSend}
            disabled={!newMessage.trim() || sending}
            size="icon"
            data-testid="button-send"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
