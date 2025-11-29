import { useState, useEffect } from 'react';
import { useDodi } from '@/contexts/DodiContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Heart, Sparkles, Smile, Zap, Send } from 'lucide-react';
import { getAllReactions, saveReaction } from '@/lib/storage-encrypted';
import type { Reaction } from '@/types';
import { nanoid } from 'nanoid';
import { useToast } from '@/hooks/use-toast';
import { format, isToday } from 'date-fns';
import { useWebSocket } from '@/hooks/use-websocket';

const reactionTypes = [
  { id: 'thinking-of-you', label: 'Thinking of you', icon: Heart, color: 'text-blush' },
  { id: 'love-you', label: 'Love you', icon: Sparkles, color: 'text-accent' },
  { id: 'miss-you', label: 'Miss you', icon: Smile, color: 'text-sage' },
  { id: 'proud', label: 'Proud of you', icon: Zap, color: 'text-gold' },
];

export default function ReactionsPage() {
  const { userId, partnerId } = useDodi();
  const { toast } = useToast();
  const { send: sendWS, ws } = useWebSocket();
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [sending, setSending] = useState<string | null>(null);

  useEffect(() => {
    loadReactions();
  }, []);

  // Listen for incoming reactions from partner and handle history sync
  useEffect(() => {
    if (!ws || !partnerId) return;

    const handleMessage = async (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'reaction') {
          console.log('Received reaction from partner:', data.data);
          const incomingReaction = data.data;
          
          if (incomingReaction.recipientId === userId && incomingReaction.senderId === partnerId) {
            await saveReaction(incomingReaction);
            setReactions(prev => {
              if (prev.some(r => r.id === incomingReaction.id)) {
                return prev;
              }
              return [incomingReaction, ...prev];
            });
          }
        } else if (data.type === 'request-reaction-history') {
          console.log('Partner requesting reaction history, sending...');
          const allReactions = await getAllReactions();
          const relevantReactions = allReactions.filter(
            r => (r.senderId === userId && r.recipientId === partnerId) ||
                 (r.senderId === partnerId && r.recipientId === userId)
          );
          
          sendWS({
            type: 'reaction-history-response',
            data: { reactions: relevantReactions, partnerId: partnerId },
          });
        } else if (data.type === 'reaction-history-response') {
          console.log('Received reaction history from partner');
          const partnerReactions: Reaction[] = data.data.reactions || [];
          
          for (const reaction of partnerReactions) {
            try {
              await saveReaction(reaction);
            } catch (err) {
              console.error('Error saving partner reaction:', err);
            }
          }
          
          await loadReactions();
          
          if (partnerReactions.length > 0) {
            toast({
              title: "Reactions synced",
              description: `Synced ${partnerReactions.length} reactions with your beloved`,
            });
          }
        }
      } catch (e) {
        console.log('WebSocket message parse error:', e);
      }
    };

    ws.addEventListener('message', handleMessage);
    
    // Request partner's reaction history with retry interval
    const requestReactionHistory = () => {
      if (ws.readyState === WebSocket.OPEN && partnerId) {
        console.log('Requesting partner reaction history...');
        sendWS({
          type: 'request-reaction-history',
          data: { requesterId: userId },
        });
      }
    };
    
    requestReactionHistory();
    const historyInterval = setInterval(requestReactionHistory, 3000);
    
    return () => {
      clearInterval(historyInterval);
      ws.removeEventListener('message', handleMessage);
    };
  }, [ws, partnerId, userId, sendWS]);

  const loadReactions = async () => {
    const allReactions = await getAllReactions();
    setReactions(allReactions);
  };

  const sendReaction = async (type: string) => {
    if (!userId || !partnerId) return;

    setSending(type);
    try {
      const reaction: Reaction = {
        id: nanoid(),
        senderId: userId,
        recipientId: partnerId,
        type,
        timestamp: new Date(),
      };

      await saveReaction(reaction);
      setReactions(prev => [reaction, ...prev]);

      // Send to partner via WebSocket
      sendWS({
        type: 'reaction',
        data: reaction,
      });

      toast({
        title: "Sent! 💝",
        description: "Your beloved will feel the love.",
      });
    } catch (error) {
      toast({
        title: "Failed to send",
        description: "Could not send reaction. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSending(null);
    }
  };

  const receivedReactions = reactions.filter(r => r.recipientId === userId);
  const sentReactions = reactions.filter(r => r.senderId === userId);

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="px-6 py-4 border-b bg-card/50">
        <h2 className="text-xl font-light text-foreground">Quick Reactions</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Send instant love notes
        </p>
      </div>

      <ScrollArea className="flex-1 p-6">
        <div className="max-w-2xl mx-auto space-y-8">
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground">Send a reaction</h3>
            <div className="grid grid-cols-2 gap-3">
              {reactionTypes.map((reaction) => {
                const Icon = reaction.icon;
                return (
                  <Button
                    key={reaction.id}
                    onClick={() => sendReaction(reaction.id)}
                    disabled={!!sending}
                    className="h-auto py-6 flex-col gap-3"
                    variant="outline"
                    data-testid={`button-reaction-${reaction.id}`}
                  >
                    <Icon className={`w-8 h-8 ${reaction.color}`} />
                    <span className="text-sm font-medium">{reaction.label}</span>
                    {sending === reaction.id && (
                      <Send className="w-4 h-4 animate-pulse" />
                    )}
                  </Button>
                );
              })}
            </div>
          </div>

          {receivedReactions.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">
                Received from your beloved
              </h3>
              <div className="space-y-2">
                {receivedReactions.map((reaction) => {
                  const reactionType = reactionTypes.find(r => r.id === reaction.type);
                  const Icon = reactionType?.icon || Heart;
                  return (
                    <Card
                      key={reaction.id}
                      className={`p-4 flex items-center gap-3 ${
                        isToday(new Date(reaction.timestamp)) 
                          ? 'bg-accent/5 border-accent/40' 
                          : ''
                      }`}
                      data-testid={`card-received-${reaction.id}`}
                    >
                      <Icon className={`w-5 h-5 ${reactionType?.color || 'text-accent'}`} />
                      <div className="flex-1">
                        <p className="text-sm font-medium">
                          {reactionType?.label || reaction.type}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(reaction.timestamp), 'MMM d, h:mm a')}
                        </p>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {sentReactions.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">
                Sent reactions
              </h3>
              <div className="space-y-2">
                {sentReactions.map((reaction) => {
                  const reactionType = reactionTypes.find(r => r.id === reaction.type);
                  const Icon = reactionType?.icon || Heart;
                  return (
                    <Card
                      key={reaction.id}
                      className="p-4 flex items-center gap-3 opacity-60"
                      data-testid={`card-sent-${reaction.id}`}
                    >
                      <Icon className={`w-5 h-5 ${reactionType?.color || 'text-sage'}`} />
                      <div className="flex-1">
                        <p className="text-sm font-medium">
                          {reactionType?.label || reaction.type}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(reaction.timestamp), 'MMM d, h:mm a')}
                        </p>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {receivedReactions.length === 0 && sentReactions.length === 0 && (
            <Card className="p-8 text-center">
              <Heart className="w-12 h-12 mx-auto text-muted-foreground mb-3 opacity-50" />
              <p className="text-muted-foreground">No reactions yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Send a quick love note to your beloved
              </p>
            </Card>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
