import { useState, useEffect, useRef, useCallback } from 'react';
import { useDodi } from '@/contexts/DodiContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Toggle } from '@/components/ui/toggle';
import { Badge } from '@/components/ui/badge';
import { Heart, Send, Image, Mic, Lock, Eye, EyeOff, ChevronUp, Check, CheckCheck, Loader2, Smile, ThumbsUp, Star, Clock, CloudOff } from 'lucide-react';
import { getMessages, saveMessage } from '@/lib/storage-encrypted';
import { usePeerConnection } from '@/hooks/use-peer-connection';
import { useOfflineQueueSize } from '@/hooks/use-offline-queue';
import { MessageMediaImage } from '@/components/message-media-image';
import type { Message, SyncMessage } from '@/types';
import { nanoid } from 'nanoid';
import { useToast } from '@/hooks/use-toast';
import { compressImage, cn } from '@/lib/utils';

const QUICK_REACTIONS = [
  { id: 'heart', icon: Heart, color: 'text-accent' },
  { id: 'like', icon: ThumbsUp, color: 'text-blue-400' },
  { id: 'star', icon: Star, color: 'text-yellow-400' },
];

const MESSAGES_PER_PAGE = 50;

export default function ChatPage() {
  const { userId, partnerId, isOnline } = useDodi();
  const { toast } = useToast();
  const { send: sendP2P, state: peerState } = usePeerConnection();
  const pendingCount = useOfflineQueueSize();

  useEffect(() => {
    const handleReconciliation = (event: any) => {
      const count = event.detail.count;
      toast({
        title: "Gardens Synced",
        description: `Reconciled ${count} missing messages from partner`,
      });
    };
    window.addEventListener('reconciliation-complete', handleReconciliation);
    return () => window.removeEventListener('reconciliation-complete', handleReconciliation);
  }, [toast]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [isDisappearing, setIsDisappearing] = useState(false);
  const [lastSyncedTimestamp, setLastSyncedTimestamp] = useState<number>(0);
  const [messageOffset, setMessageOffset] = useState(0);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const typingThrottleRef = useRef<NodeJS.Timeout | null>(null);
  const doubleTapRef = useRef<{ messageId: string; time: number } | null>(null);

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
        
        // Handle typing indicator
        if (message.type === 'typing') {
          console.log('⌨️ [P2P] Partner is typing...');
          setIsPartnerTyping(true);
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => {
            setIsPartnerTyping(false);
            console.log('⌨️ [P2P] Typing indicator cleared');
          }, 3000);
          return;
        }
        
        // Handle delivery receipt ACK
        if (message.type === 'ack') {
          const { messageId } = message.data as { messageId: string };
          console.log('✅ [P2P] Message delivered:', messageId);
          setMessages(prev => prev.map(m => 
            m.id === messageId ? { ...m, status: 'delivered' } : m
          ));
          return;
        }

        // Handle incoming reaction
        if (message.type === 'reaction') {
          const { messageId, reaction, userId: reactUserId } = message.data as { messageId: string; reaction: string | null; userId: string };
          console.log('💝 [P2P] Received reaction:', reaction, 'for message:', messageId);
          setMessages(prev => prev.map(m => {
            if (m.id === messageId) {
              const newReactions = { ...m.reactions };
              if (reaction) {
                newReactions[reactUserId] = reaction;
              } else {
                delete newReactions[reactUserId];
              }
              return { ...m, reactions: Object.keys(newReactions).length > 0 ? newReactions : undefined };
            }
            return m;
          }));
          return;
        }
        
        if (message.type === 'message') {
          const incomingMessage = message.data as Message;
          
          // Validate sender is our paired partner
          if (incomingMessage.senderId === partnerId) {
            console.log('💾 [P2P] Saving partner message:', incomingMessage.id);
            
            // If mediaUrl is ArrayBuffer (binary image data), convert to Blob and save
            if (incomingMessage.mediaUrl && typeof incomingMessage.mediaUrl === 'object' && (incomingMessage.mediaUrl as unknown) instanceof ArrayBuffer) {
              const { saveMediaBlob } = await import('@/lib/storage');
              const blob = new Blob([incomingMessage.mediaUrl], { type: 'image/jpeg' });
              await saveMediaBlob(incomingMessage.id, blob, 'message');
              incomingMessage.mediaUrl = null; // Clear mediaUrl from object before saving metadata
            }
            
            await saveMessage(incomingMessage);
            
            // Notify if app in background
            notifyNewMessage();
            
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
            
            // SEND ACK - Confirm delivery
            console.log('📤 [P2P] Sending delivery ACK for:', incomingMessage.id);
            sendP2P({
              type: 'ack',
              data: { messageId: incomingMessage.id },
              timestamp: Date.now(),
            });
          } else {
            console.warn('🚫 [P2P] Message from unknown sender:', incomingMessage.senderId);
          }
        }
      } catch (error) {
        console.error('❌ [P2P] Error handling P2P message:', error);
      }
    };

    window.addEventListener('p2p-message', handleP2pMessage as unknown as EventListener);
    console.log('✅ [P2P] Chat: P2P message listener attached');
    
    return () => {
      console.log('🧹 [P2P] Chat: Cleaning up P2P message listener');
      window.removeEventListener('p2p-message', handleP2pMessage as unknown as EventListener);
    };
  }, [peerState.connected, partnerId, lastSyncedTimestamp]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Update queued messages to 'sent' when connection is restored
  useEffect(() => {
    if (peerState.connected) {
      setMessages(prev => {
        const hasQueued = prev.some(m => m.status === 'queued');
        if (hasQueued) {
          console.log('🔄 [P2P] Connection restored - updating queued messages to sent');
          return prev.map(m => 
            m.status === 'queued' ? { ...m, status: 'sent' as const } : m
          );
        }
        return prev;
      });
    }
  }, [peerState.connected]);

  const loadMessages = async () => {
    const msgs = await getMessages(MESSAGES_PER_PAGE, 0);
    setMessages(msgs);
    setMessageOffset(0);
    setHasMoreMessages(msgs.length === MESSAGES_PER_PAGE);
  };

  const loadMoreMessages = async () => {
    setLoadingMore(true);
    const newOffset = messageOffset + MESSAGES_PER_PAGE;
    const msgs = await getMessages(MESSAGES_PER_PAGE, newOffset);
    setMessages(prev => [...msgs, ...prev]);
    setMessageOffset(newOffset);
    setHasMoreMessages(msgs.length === MESSAGES_PER_PAGE);
    setLoadingMore(false);
  };

  const handleReaction = useCallback((messageId: string, reaction: string) => {
    if (!userId) return;
    
    setMessages(prev => prev.map(m => {
      if (m.id === messageId) {
        const currentReaction = m.reactions?.[userId];
        const newReactions = { ...m.reactions };
        
        if (currentReaction === reaction) {
          delete newReactions[userId];
        } else {
          newReactions[userId] = reaction;
        }
        
        const finalReaction = currentReaction === reaction ? null : reaction;
        
        sendP2P({
          type: 'reaction',
          data: { messageId, reaction: finalReaction, userId },
          timestamp: Date.now(),
        });
        
        return { ...m, reactions: Object.keys(newReactions).length > 0 ? newReactions : undefined };
      }
      return m;
    }));
    setShowReactionPicker(null);
  }, [userId, sendP2P]);

  const handleMessageTap = useCallback((messageId: string) => {
    const now = Date.now();
    if (doubleTapRef.current?.messageId === messageId && now - doubleTapRef.current.time < 300) {
      handleReaction(messageId, 'heart');
      doubleTapRef.current = null;
    } else {
      doubleTapRef.current = { messageId, time: now };
    }
  }, [handleReaction]);

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

    // OFFLINE QUEUING: Don't block when offline - let P2P layer queue it
    const isOffline = !peerState.connected;

    setSending(true);
    try {
      const messageId = nanoid();
      const now = new Date();
      
      // Use 'queued' status when offline, 'sending' when online
      const message: Message = {
        id: messageId,
        senderId: userId,
        recipientId: partnerId,
        content: newMessage,
        type: 'text',
        mediaUrl: null,
        isDisappearing,
        timestamp: now,
        status: isOffline ? 'queued' : 'sending',
      };

      // Save to IndexedDB first (encrypted) - works offline
      await saveMessage(message);

      // Add to local state immediately
      setMessages(prev => [...prev, message]);
      setNewMessage('');

      // Send via P2P data channel - if offline, P2P layer queues it automatically
      console.log(`📤 [P2P] ${isOffline ? 'Queueing' : 'Sending'} message:`, messageId);
      sendP2P({
        type: 'message',
        data: message,
        timestamp: Date.now(),
      });

      // Update status based on connection state
      if (!isOffline) {
        setMessages(prev => prev.map(m => 
          m.id === messageId ? { ...m, status: 'sent' } : m
        ));
      } else {
        // Notify sender that message is queued
        notifyMessageQueued();
        
        // Show toast for offline queue confirmation
        toast({
          title: "Message queued",
          description: "Will be sent when connection is restored",
        });
      }
      
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

  const handleTyping = () => {
    if (!peerState.connected || !partnerId) return;
    
    // Throttle typing indicator - send max once per second
    if (!typingThrottleRef.current) {
      console.log('⌨️ [P2P] Sending typing indicator');
      sendP2P({
        type: 'typing',
        data: {},
        timestamp: Date.now(),
      });
      
      typingThrottleRef.current = setTimeout(() => {
        typingThrottleRef.current = null;
      }, 1000);
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
      const messageId = nanoid();
      const now = new Date();

      // Compress image to Blob (70-90% size reduction)
      console.log('🖼️ Compressing image...');
      const compressedBlob = await compressImage(file);

      const message: Message = {
        id: messageId,
        senderId: userId!,
        recipientId: partnerId!,
        content: file.name,
        type: 'image',
        mediaUrl: null,
        isDisappearing,
        timestamp: now,
      };

      // Save compressed blob to IndexedDB media store
      const { saveMediaBlob } = await import('@/lib/storage');
      await saveMediaBlob(messageId, compressedBlob, 'message');

      // Save message metadata to IndexedDB
      await saveMessage(message);

      // Add to local state
      setMessages(prev => [...prev, message]);

      // Send via P2P data channel as ArrayBuffer (no Base64 overhead)
      const arrayBuffer = await compressedBlob.arrayBuffer();
      console.log('📤 [P2P] Sending compressed image via P2P:', messageId, `(${arrayBuffer.byteLength}B)`);
      sendP2P({
        type: 'message',
        data: { ...message, mediaUrl: arrayBuffer },
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
          <div className={`w-10 h-10 rounded-full bg-gradient-to-br from-sage to-blush flex items-center justify-center ${peerState.connected ? 'animate-gentle-pulse' : ''}`}>
            <Heart className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="font-medium text-foreground">my beloved</h2>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Lock className="w-3 h-3" />
              Your whispers stay only between you two — forever
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <Badge 
              variant="outline" 
              className="bg-amber-500/10 text-amber-600 border-amber-500/30 gap-1 text-xs"
              data-testid="badge-pending-messages"
            >
              <CloudOff className="w-3 h-3" />
              {pendingCount} pending
            </Badge>
          )}
          <Button
            onClick={handleThinkingOfYou}
            size="icon"
            variant="ghost"
            className="text-accent flex-shrink-0"
            data-testid="button-thinking-of-you"
          >
            <Heart className="w-5 h-5 animate-gentle-pulse" />
          </Button>
        </div>
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

          {hasMoreMessages && messages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={loadMoreMessages}
              disabled={loadingMore}
              className="mx-auto w-full"
              data-testid="button-load-more-messages"
            >
              <ChevronUp className="w-4 h-4 mr-2" />
              {loadingMore ? 'Loading...' : 'Load Earlier Messages'}
            </Button>
          )}

          {isPartnerTyping && (
            <div className="flex justify-start">
              <div className="flex items-center gap-1 px-4 py-2">
                <span className="w-1.5 h-1.5 bg-sage rounded-full animate-bounce" />
                <span className="w-1.5 h-1.5 bg-sage rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                <span className="w-1.5 h-1.5 bg-sage rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
              </div>
            </div>
          )}

          {messages.map((message) => {
            const isSent = message.senderId === userId;
            const isImage = message.type === 'image';
            const hasReactions = message.reactions && Object.keys(message.reactions).length > 0;
            const myReaction = userId ? message.reactions?.[userId] : null;
            const partnerReaction = partnerId ? message.reactions?.[partnerId] : null;
            
            return (
              <div
                key={message.id}
                className={`flex ${isSent ? 'justify-end' : 'justify-start'} animate-fade-in relative`}
                data-testid={`message-${message.id}`}
              >
                <div className="relative">
                  <Card
                    onClick={() => handleMessageTap(message.id)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setShowReactionPicker(showReactionPicker === message.id ? null : message.id);
                    }}
                    className={cn(
                      'max-w-[70%] cursor-pointer transition-transform active:scale-[0.98]',
                      isImage ? 'p-0 overflow-hidden' : 'p-4',
                      isSent ? 'bg-sage/30 border-sage/40' : 'bg-card border-card-border'
                    )}
                  >
                    {isImage ? (
                      <div className="space-y-2">
                        <MessageMediaImage messageId={message.id} fileName={message.content} />
                        <div className="flex items-center justify-between px-3 pb-2">
                          <p className="text-xs text-muted-foreground">
                            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                          {isSent && (
                            <div className="ml-2">
                              {message.status === 'queued' && <Clock className="w-3 h-3 text-amber-500" />}
                              {message.status === 'sending' && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                              {message.status === 'sent' && <Check className="w-3 h-3 text-muted-foreground" />}
                              {message.status === 'delivered' && <CheckCheck className="w-3 h-3 text-blue-400" />}
                              {!message.status && <Check className="w-3 h-3 text-muted-foreground" />}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm leading-relaxed">{message.content}</p>
                        <div className="flex items-center justify-between mt-2 gap-2">
                          <p className="text-xs text-muted-foreground">
                            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                          {isSent && (
                            <div className="ml-2">
                              {message.status === 'queued' && <Clock className="w-3 h-3 text-amber-500" />}
                              {message.status === 'sending' && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                              {message.status === 'sent' && <Check className="w-3 h-3 text-muted-foreground" />}
                              {message.status === 'delivered' && <CheckCheck className="w-3 h-3 text-blue-400" />}
                              {!message.status && <Check className="w-3 h-3 text-muted-foreground" />}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </Card>

                  {hasReactions && (
                    <div className={cn(
                      'absolute -bottom-2 flex gap-0.5',
                      isSent ? 'right-2' : 'left-2'
                    )}>
                      {(myReaction || partnerReaction) && (
                        <span className="text-sm bg-card border rounded-full px-1.5 py-0.5 shadow-sm flex items-center gap-0.5">
                          {myReaction === 'heart' && <Heart className="w-3 h-3 text-accent fill-current" />}
                          {myReaction === 'like' && <ThumbsUp className="w-3 h-3 text-blue-400" />}
                          {myReaction === 'star' && <Star className="w-3 h-3 text-yellow-400 fill-current" />}
                          {partnerReaction && partnerReaction !== myReaction && (
                            <>
                              {partnerReaction === 'heart' && <Heart className="w-3 h-3 text-accent fill-current" />}
                              {partnerReaction === 'like' && <ThumbsUp className="w-3 h-3 text-blue-400" />}
                              {partnerReaction === 'star' && <Star className="w-3 h-3 text-yellow-400 fill-current" />}
                            </>
                          )}
                        </span>
                      )}
                    </div>
                  )}

                  {showReactionPicker === message.id && (
                    <div className={cn(
                      'absolute -top-10 flex gap-1 bg-card border rounded-full px-2 py-1 shadow-lg z-10',
                      isSent ? 'right-0' : 'left-0'
                    )}>
                      {QUICK_REACTIONS.map((r) => {
                        const Icon = r.icon;
                        const isActive = myReaction === r.id;
                        return (
                          <button
                            key={r.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleReaction(message.id, r.id);
                            }}
                            className={cn(
                              'p-1.5 rounded-full transition-transform hover:scale-110',
                              isActive && 'bg-accent/20'
                            )}
                            data-testid={`reaction-${r.id}-${message.id}`}
                          >
                            <Icon className={cn('w-4 h-4', r.color, isActive && 'fill-current')} />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
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
            onChange={(e) => {
              setNewMessage(e.target.value);
              handleTyping();
            }}
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
