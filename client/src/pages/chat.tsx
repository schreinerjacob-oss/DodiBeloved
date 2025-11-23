import { useState, useEffect, useRef } from 'react';
import { useDodi } from '@/contexts/DodiContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Toggle } from '@/components/ui/toggle';
import { Heart, Send, Image, Mic, Lock, Eye, EyeOff } from 'lucide-react';
import { getAllMessages, saveMessage } from '@/lib/storage';
import { useWebSocket } from '@/hooks/use-websocket';
import type { Message } from '@shared/schema';
import { nanoid } from 'nanoid';
import { useToast } from '@/hooks/use-toast';

export default function ChatPage() {
  const { userId, partnerId, isOnline } = useDodi();
  const { toast } = useToast();
  const { send: sendWS, ws, connected } = useWebSocket();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [isDisappearing, setIsDisappearing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadMessages();
  }, []);

  useEffect(() => {
    if (!ws || !partnerId) {
      console.log('Chat: Waiting for ws or partnerId', { hasWs: !!ws, partnerId });
      return;
    }

    console.log('Chat: Setting up message listener for partnerId:', partnerId);

    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        console.log('Chat: Received WebSocket message:', { type: data.type, senderId: data.data?.senderId, partnerId });
        
        if (data.type === 'message') {
          const incomingMessage = data.data;
          console.log('Chat: Processing incoming message:', { 
            senderId: incomingMessage.senderId, 
            partnerId,
            isFromPartner: incomingMessage.senderId === partnerId 
          });
          
          if (incomingMessage.senderId === partnerId) {
            console.log('Chat: Message is from partner, adding to state');
            setMessages(prev => [...prev, incomingMessage]);
            saveMessage(incomingMessage).catch(err => console.error('Failed to save message:', err));
          } else {
            console.log('Chat: Message is NOT from partner, ignoring');
          }
        }
      } catch (error) {
        console.error('Error handling WebSocket message:', error);
      }
    };

    ws.addEventListener('message', handleMessage);
    console.log('Chat: Message listener attached');
    
    return () => {
      console.log('Chat: Cleaning up message listener');
      ws.removeEventListener('message', handleMessage);
    };
  }, [ws, partnerId]);

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
    console.log('handleSend called:', { text: newMessage.trim(), userId, partnerId, connected });
    
    if (!newMessage.trim()) {
      console.log('No message text');
      return;
    }

    if (!userId || !partnerId) {
      console.log('Missing userId or partnerId');
      toast({
        title: "Not paired",
        description: "Please pair with your beloved first",
        variant: "destructive",
      });
      return;
    }

    setSending(true);
    try {
      const now = new Date();
      const messageObj: any = {
        id: nanoid(),
        senderId: userId,
        recipientId: partnerId,
        content: newMessage,
        type: 'text',
        mediaUrl: null,
        isDisappearing,
        timestamp: now.getTime(), // Convert to milliseconds for proper IDB storage
      };

      console.log('Saving message to IndexedDB:', messageObj.id);
      
      // Save to IndexedDB first
      try {
        await saveMessage(messageObj);
      } catch (dbError) {
        console.error('IDB save error:', dbError);
        // Continue anyway - we can still send via WebSocket
      }
      
      console.log('Adding message to state');
      
      // Add to local state immediately with proper timestamp
      const displayMessage: Message = {
        ...messageObj,
        timestamp: now,
      };
      setMessages(prev => [...prev, displayMessage]);
      setNewMessage('');

      console.log('Sending message via WebSocket:', messageObj.id);
      
      // Send via WebSocket with numeric timestamp
      sendWS({
        type: 'message',
        data: messageObj,
      });

      toast({
        title: "Message sent",
      });

      console.log('Message sent successfully:', messageObj.id);
      
      if (isDisappearing) {
        console.log('Disappearing message enabled, will delete after 30 seconds');
        toast({
          title: "Message will disappear in 30 seconds",
        });
        setTimeout(() => {
          setMessages(prev => prev.filter(m => m.id !== messageObj.id));
        }, 30000);
      }
    } catch (error) {
      console.error('Send error:', error);
      toast({
        title: "Failed to send",
        description: error instanceof Error ? error.message : "Could not send message. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const handleThinkingOfYou = async () => {
    toast({
      title: "Thinking of you",
      description: "Heart sent to your beloved",
    });
  };

  return (
    <div className="w-screen flex flex-col bg-background" style={{ minHeight: '100dvh' }}>
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b bg-card/50">
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
          className="text-accent hover:text-accent flex-shrink-0"
          data-testid="button-thinking-of-you"
        >
          <Heart className="w-5 h-5 animate-pulse-glow" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-6" ref={scrollRef}>
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
      </div>

      <div className="flex-shrink-0 border-t bg-card/50 p-4">
        <div className="max-w-3xl mx-auto flex items-center gap-2">
          <Button
            size="icon"
            variant="ghost"
            className="flex-shrink-0 text-muted-foreground"
            data-testid="button-attach-image"
          >
            <Image className="w-5 h-5" />
          </Button>

          <Button
            size="icon"
            variant="ghost"
            className="flex-shrink-0 text-muted-foreground"
            data-testid="button-voice-note"
          >
            <Mic className="w-5 h-5" />
          </Button>

          <Toggle
            pressed={isDisappearing}
            onPressedChange={setIsDisappearing}
            className="flex-shrink-0 text-muted-foreground"
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
            className="flex-shrink-0"
            data-testid="button-send"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
