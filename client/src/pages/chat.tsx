import { useState, useEffect, useRef } from 'react';
import { useDodi } from '@/contexts/DodiContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Toggle } from '@/components/ui/toggle';
import { Heart, Send, Image, Mic, Lock, Eye, EyeOff } from 'lucide-react';
import { getAllMessages, saveMessage } from '@/lib/storage-encrypted';
import { usePeerConnection } from '@/hooks/use-peer-connection';
import type { Message, SyncMessage } from '@/types';
import { nanoid } from 'nanoid';
import { useToast } from '@/hooks/use-toast';

export default function ChatPage() {
  const { userId, partnerId, isOnline } = useDodi();
  const { toast } = useToast();
  const { send: sendP2P, state: peerState } = usePeerConnection();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [isDisappearing, setIsDisappearing] = useState(false);
  const [lastSyncedTimestamp, setLastSyncedTimestamp] = useState<number>(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadMessages();
  }, []);

  // Listen for incoming P2P messages
  useEffect(() => {
    if (!peerState.connected || !partnerId) {
      console.log('🔗 [P2P] Chat: Waiting for P2P connection or partnerId', { connected: peerState.connected, partnerId });
      return;
    }

    console.log('🔗 [P2P] Chat: Setting up P2P message listener for partnerId:', partnerId);
    
    const handleP2pMessage = async (event: CustomEvent) => {
      try {
        const message: SyncMessage = event.detail;
        console.log('📩 [P2P] Chat: Received P2P message type:', message.type);
        
        if (message.type === 'message') {
          const incomingMessage = message.data as Message;
          
          // Validate sender is our paired partner
          if (incomingMessage.senderId === partnerId) {
            console.log('💾 [P2P] Saving partner message:', incomingMessage.id);
            await saveMessage(incomingMessage);
            setMessages(prev => {
              // Deduplicate - don't add if already exists
              if (prev.some(m => m.id === incomingMessage.id)) {
                console.log('⚠️ [P2P] Message already exists, skipping');
                return prev;
              }
              return [...prev, incomingMessage];
            });
            
            // Update last synced timestamp
            const msgTime = new Date(incomingMessage.timestamp).getTime();
            if (msgTime > lastSyncedTimestamp) {
              setLastSyncedTimestamp(msgTime);
            }
          } else {
            console.warn('🚫 [P2P] Message from unknown sender:', incomingMessage.senderId);
          }
        }
      } catch (error) {
        console.error('❌ [P2P] Error handling P2P message:', error);
      }
    };

    window.addEventListener('p2p-message', handleP2pMessage as EventListener);
    console.log('✅ [P2P] Chat: P2P message listener attached');
    
    return () => {
      console.log('🧹 [P2P] Chat: Cleaning up P2P message listener');
      window.removeEventListener('p2p-message', handleP2pMessage as EventListener);
    };
  }, [peerState.connected, partnerId, lastSyncedTimestamp]);

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
    if (!newMessage.trim()) {
      return;
    }

    if (!userId || !partnerId) {
      toast({
        title: "Not paired",
        description: "Please pair with your beloved first",
        variant: "destructive",
      });
      return;
    }

    if (!peerState.connected) {
      toast({
        title: "Connection lost",
        description: "Waiting for P2P connection to your beloved...",
        variant: "destructive",
      });
      return;
    }

    setSending(true);
    try {
      const messageId = nanoid();
      const now = new Date();
      
      const message: Message = {
        id: messageId,
        senderId: userId,
        recipientId: partnerId,
        content: newMessage,
        type: 'text',
        mediaUrl: null,
        isDisappearing,
        timestamp: now,
      };

      // Save to IndexedDB first
      await saveMessage(message);

      // Add to local state immediately
      setMessages(prev => [...prev, message]);
      setNewMessage('');

      // Send via P2P data channel
      console.log('📤 [P2P] Sending message via P2P:', messageId);
      sendP2P({
        type: 'message',
        data: message,
        timestamp: Date.now(),
      });

      toast({
        title: "Message sent",
      });
      
      if (isDisappearing) {
        setTimeout(() => {
          setMessages(prev => prev.filter(m => m.id !== messageId));
        }, 30000);
      }
    } catch (error) {
      console.error('❌ [P2P] Send error:', error);
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
      title: "Thinking of you",
      description: "Heart sent to your beloved",
    });
  };

  const handleImageClick = () => {
    console.log('Image button clicked!');
    fileInputRef.current?.click();
  };

  const handleVoiceClick = () => {
    console.log('Voice button clicked!');
    toast({
      title: "Voice recording",
      description: "Voice messages coming soon!",
    });
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file is an image
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid file",
        description: "Please select an image",
        variant: "destructive",
      });
      return;
    }

    // Max 5MB
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Image must be under 5MB",
        variant: "destructive",
      });
      return;
    }

    setSending(true);
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target?.result as string;
        const messageId = nanoid();
        const now = new Date();

        const message: Message = {
          id: messageId,
          senderId: userId!,
          recipientId: partnerId!,
          content: file.name,
          type: 'image',
          mediaUrl: base64,
          isDisappearing,
          timestamp: now,
        };

        // Save to IndexedDB
        await saveMessage(message);

        // Add to local state
        setMessages(prev => [...prev, message]);

        // Send via P2P data channel
        console.log('📤 [P2P] Sending image via P2P:', messageId);
        sendP2P({
          type: 'message',
          data: message,
          timestamp: Date.now(),
        });

        toast({
          title: "Image sent",
        });

        if (isDisappearing) {
          setTimeout(() => {
            setMessages(prev => prev.filter(m => m.id !== messageId));
          }, 30000);
        }

        setSending(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Image send error:', error);
      toast({
        title: "Failed to send image",
        variant: "destructive",
      });
      setSending(false);
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b bg-card/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-sage to-blush flex items-center justify-center">
            <Heart className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="font-medium text-foreground">my beloved</h2>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Lock className="w-3 h-3" />
              {peerState.connected ? 'P2P Connected' : 'Connecting...'} • Encrypted
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
            const isImage = message.type === 'image';
            return (
              <div
                key={message.id}
                className={`flex ${isSent ? 'justify-end' : 'justify-start'} animate-fade-in`}
                data-testid={`message-${message.id}`}
              >
                <Card
                  className={`max-w-[70%] ${isImage ? 'p-0 overflow-hidden' : 'p-4'} ${
                    isSent
                      ? 'bg-sage/30 border-sage/40'
                      : 'bg-card border-card-border'
                  }`}
                >
                  {isImage && message.mediaUrl ? (
                    <div className="space-y-2">
                      <img
                        src={message.mediaUrl}
                        alt={message.content}
                        className="w-full h-auto rounded-md"
                        data-testid="message-image"
                      />
                      <p className="text-xs text-muted-foreground px-3 pb-2">
                        {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm leading-relaxed">{message.content}</p>
                      <p className="text-xs text-muted-foreground mt-2">
                        {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </>
                  )}
                </Card>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex-shrink-0 border-t bg-card/50 p-4">
        <div className="max-w-3xl mx-auto flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            className="hidden"
            data-testid="input-image-file"
          />
          <button
            onClick={handleImageClick}
            disabled={sending}
            className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-md hover:bg-accent/10 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="button-attach-image"
            type="button"
          >
            <Image className="w-5 h-5 text-muted-foreground" />
          </button>

          <button
            onClick={handleVoiceClick}
            disabled={sending}
            className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-md hover:bg-accent/10 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="button-voice-note"
            type="button"
          >
            <Mic className="w-5 h-5 text-muted-foreground" />
          </button>

          <button
            onClick={() => {
              console.log('Toggle clicked! New state:', !isDisappearing);
              setIsDisappearing(!isDisappearing);
            }}
            disabled={sending}
            className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-md hover:bg-accent/10 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="button-disappearing"
            title="Send disappearing message"
            type="button"
          >
            {isDisappearing ? (
              <EyeOff className="w-5 h-5 text-accent" />
            ) : (
              <Eye className="w-5 h-5 text-muted-foreground" />
            )}
          </button>

          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
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
            type="button"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
