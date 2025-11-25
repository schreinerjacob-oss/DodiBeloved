import { useState, useEffect } from 'react';
import { useDodi } from '@/contexts/DodiContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Sparkles, Heart, Check, Smile, Frown, Meh, Laugh, Angry, Zap } from 'lucide-react';
import { getAllDailyRituals, saveDailyRitual } from '@/lib/storage-encrypted';
import type { DailyRitual } from '@/types';
import { nanoid } from 'nanoid';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { useWebSocket } from '@/hooks/use-websocket';

const emotions = [
  { name: 'joyful', icon: Laugh, color: 'text-yellow-500' },
  { name: 'loved', icon: Heart, color: 'text-accent' },
  { name: 'content', icon: Smile, color: 'text-sage' },
  { name: 'peaceful', icon: Sparkles, color: 'text-blue-500' },
  { name: 'neutral', icon: Meh, color: 'text-muted-foreground' },
  { name: 'anxious', icon: Zap, color: 'text-orange-500' },
  { name: 'sad', icon: Frown, color: 'text-blue-600' },
  { name: 'frustrated', icon: Angry, color: 'text-destructive' },
];

export default function DailyRitualPage() {
  const { userId, partnerId } = useDodi();
  const { toast } = useToast();
  const { send: sendWS, ws } = useWebSocket();
  const [rituals, setRituals] = useState<DailyRitual[]>([]);
  const [selectedEmotion, setSelectedEmotion] = useState('');
  const [lovedMoment, setLovedMoment] = useState('');
  const [gratitude, setGratitude] = useState('');
  const [tomorrowNeed, setTomorrowNeed] = useState('');
  const [saving, setSaving] = useState(false);
  const [todayCompleted, setTodayCompleted] = useState(false);

  useEffect(() => {
    loadRituals();
  }, []);

  // Listen for incoming rituals from partner and handle history sync
  useEffect(() => {
    if (!ws || !partnerId) return;

    const handleMessage = async (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'ritual') {
          console.log('Received ritual from partner:', data.data);
          const incomingRitual = data.data;
          
          // Accept rituals between us and our partner (either direction)
          const isOurRitual = (incomingRitual.userId === userId && incomingRitual.partnerId === partnerId) ||
                             (incomingRitual.userId === partnerId && incomingRitual.partnerId === userId);
          
          if (isOurRitual) {
            await saveDailyRitual(incomingRitual);
            setRituals(prev => {
              if (prev.some(r => r.id === incomingRitual.id)) {
                return prev;
              }
              return [...prev, incomingRitual];
            });
          }
        } else if (data.type === 'request-ritual-history') {
          console.log('Partner requesting ritual history, sending...');
          const allRituals = await getAllDailyRituals();
          const relevantRituals = allRituals.filter(
            r => (r.userId === userId && r.partnerId === partnerId) ||
                 (r.userId === partnerId && r.partnerId === userId)
          );
          
          sendWS({
            type: 'ritual-history-response',
            data: { rituals: relevantRituals, partnerId: partnerId },
          });
        } else if (data.type === 'ritual-history-response') {
          console.log('Received ritual history from partner');
          const partnerRituals: DailyRitual[] = data.data.rituals || [];
          
          for (const ritual of partnerRituals) {
            try {
              await saveDailyRitual(ritual);
            } catch (err) {
              console.error('Error saving partner ritual:', err);
            }
          }
          
          await loadRituals();
          
          if (partnerRituals.length > 0) {
            toast({
              title: "Rituals synced",
              description: `Synced ${partnerRituals.length} rituals with your beloved`,
            });
          }
        }
      } catch (e) {
        console.log('WebSocket message parse error:', e);
      }
    };

    ws.addEventListener('message', handleMessage);
    
    // Request partner's ritual history on connection
    const requestHistoryTimeout = setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN && partnerId) {
        console.log('Requesting partner ritual history...');
        sendWS({
          type: 'request-ritual-history',
          data: { requesterId: userId },
        });
      }
    }, 500);
    
    return () => {
      clearTimeout(requestHistoryTimeout);
      ws.removeEventListener('message', handleMessage);
    };
  }, [ws, partnerId, userId]);

  const loadRituals = async () => {
    const allRituals = await getAllDailyRituals();
    setRituals(allRituals);

    const today = format(new Date(), 'yyyy-MM-dd');
    const todayRitual = allRituals.find(
      r => format(new Date(r.ritualDate), 'yyyy-MM-dd') === today && r.userId === userId
    );
    setTodayCompleted(!!todayRitual);
  };

  const handleSubmit = async () => {
    if (!selectedEmotion || !lovedMoment.trim() || !gratitude.trim() || !tomorrowNeed.trim()) {
      toast({
        title: "Incomplete ritual",
        description: "Please answer all questions before submitting.",
        variant: "destructive",
      });
      return;
    }

    if (!userId || !partnerId) return;

    setSaving(true);
    try {
      const ritual: DailyRitual = {
        id: nanoid(),
        userId,
        partnerId,
        emotion: selectedEmotion,
        lovedMoment,
        gratitude,
        tomorrowNeed,
        ritualDate: new Date(),
        createdAt: new Date(),
      };

      await saveDailyRitual(ritual);
      setRituals(prev => [...prev, ritual]);
      setTodayCompleted(true);

      // Send to partner via WebSocket
      sendWS({
        type: 'ritual',
        data: ritual,
      });

      setSelectedEmotion('');
      setLovedMoment('');
      setGratitude('');
      setTomorrowNeed('');

      toast({
        title: "Ritual complete ✨",
        description: "Your reflections have been saved.",
      });
    } catch (error) {
      toast({
        title: "Failed to save",
        description: "Could not save ritual. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="px-6 py-4 border-b bg-card/50">
        <h2 className="text-xl font-light text-foreground">Daily Ritual</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Reflect and connect each day
        </p>
      </div>

      <ScrollArea className="flex-1 p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {todayCompleted ? (
            <Card className="p-6 bg-gradient-to-br from-sage/10 to-blush/10 border-sage/30">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-sage/20 flex items-center justify-center">
                  <Check className="w-5 h-5 text-sage" />
                </div>
                <div>
                  <h3 className="font-medium">Today's ritual complete</h3>
                  <p className="text-sm text-muted-foreground">
                    Come back tomorrow for your next reflection
                  </p>
                </div>
              </div>
            </Card>
          ) : (
            <div className="space-y-6">
              <Card className="p-6 space-y-4 border-sage/30">
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-gold" />
                    How are you feeling today?
                  </label>
                  <div className="grid grid-cols-4 gap-3">
                    {emotions.map((emotion) => {
                      const Icon = emotion.icon;
                      return (
                        <button
                          key={emotion.name}
                          onClick={() => setSelectedEmotion(emotion.name)}
                          className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all hover-elevate ${
                            selectedEmotion === emotion.name
                              ? 'border-primary bg-primary/5'
                              : 'border-border'
                          }`}
                          data-testid={`button-emotion-${emotion.name}`}
                        >
                          <Icon className={`w-6 h-6 ${emotion.color}`} />
                          <span className="text-xs capitalize">{emotion.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </Card>

              <Card className="p-6 space-y-4 border-accent/30">
                <label className="text-sm font-medium font-handwritten">
                  What made you feel most loved today?
                </label>
                <Textarea
                  value={lovedMoment}
                  onChange={(e) => setLovedMoment(e.target.value)}
                  placeholder="Share a moment..."
                  className="min-h-[100px] resize-none"
                  data-testid="input-loved-moment"
                />
              </Card>

              <Card className="p-6 space-y-4 border-sage/30">
                <label className="text-sm font-medium font-handwritten">
                  One thing I'm grateful for in you
                </label>
                <Textarea
                  value={gratitude}
                  onChange={(e) => setGratitude(e.target.value)}
                  placeholder="Express your gratitude..."
                  className="min-h-[100px] resize-none"
                  data-testid="input-gratitude"
                />
              </Card>

              <Card className="p-6 space-y-4 border-blush/30">
                <label className="text-sm font-medium font-handwritten">
                  Tomorrow I need...
                </label>
                <Textarea
                  value={tomorrowNeed}
                  onChange={(e) => setTomorrowNeed(e.target.value)}
                  placeholder="What would help you tomorrow?"
                  className="min-h-[100px] resize-none"
                  data-testid="input-tomorrow-need"
                />
              </Card>

              <Button
                onClick={handleSubmit}
                disabled={saving}
                className="w-full h-12 text-base"
                data-testid="button-submit-ritual"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Complete Today's Ritual
              </Button>
            </div>
          )}

          {rituals.length > 0 && (
            <div className="space-y-3 mt-8">
              <h3 className="text-sm font-medium text-muted-foreground">Past Reflections</h3>
              {rituals.slice(-5).reverse().map(ritual => (
                <Card
                  key={ritual.id}
                  className="p-4 hover-elevate cursor-pointer"
                  data-testid={`ritual-${ritual.id}`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(ritual.ritualDate), 'MMMM d, yyyy')}
                    </span>
                    <span className="text-xs capitalize px-2 py-1 rounded-full bg-muted">
                      {ritual.emotion}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {ritual.gratitude}
                  </p>
                </Card>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
