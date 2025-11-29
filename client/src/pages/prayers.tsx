import { useState, useEffect } from 'react';
import { useDodi } from '@/contexts/DodiContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Sparkles, Lock, Plus } from 'lucide-react';
import { getAllPrayers, savePrayer } from '@/lib/storage-encrypted';
import type { Prayer } from '@/types';
import { nanoid } from 'nanoid';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { useWebSocket } from '@/hooks/use-websocket';

export default function PrayersPage() {
  const { userId, partnerId } = useDodi();
  const { toast } = useToast();
  const { send: sendWS, ws } = useWebSocket();
  const [prayers, setPrayers] = useState<Prayer[]>([]);
  const [gratitude, setGratitude] = useState('');
  const [prayer, setPrayer] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [todaySubmitted, setTodaySubmitted] = useState(false);

  useEffect(() => {
    loadPrayers();
  }, []);

  // Listen for incoming prayers from partner and handle history sync
  useEffect(() => {
    if (!ws || !partnerId) return;

    const handleMessage = async (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'prayer') {
          console.log('Received prayer from partner:', data.data);
          const incomingPrayer = data.data;
          
          // Accept prayers/gratitude between us and our partner (either direction)
          const isOurPrayer = (incomingPrayer.userId === userId && incomingPrayer.partnerId === partnerId) ||
                             (incomingPrayer.userId === partnerId && incomingPrayer.partnerId === userId);
          
          if (isOurPrayer) {
            await savePrayer(incomingPrayer);
            setPrayers(prev => {
              if (prev.some(p => p.id === incomingPrayer.id)) {
                return prev;
              }
              return [...prev, incomingPrayer];
            });
          }
        } else if (data.type === 'request-prayer-history') {
          console.log('Partner requesting prayer history, sending...');
          const allPrayers = await getAllPrayers();
          const relevantPrayers = allPrayers.filter(
            p => (p.userId === userId && p.partnerId === partnerId) ||
                 (p.userId === partnerId && p.partnerId === userId)
          );
          
          sendWS({
            type: 'prayer-history-response',
            data: { prayers: relevantPrayers, partnerId: partnerId },
          });
        } else if (data.type === 'prayer-history-response') {
          console.log('Received prayer history from partner');
          const partnerPrayers: Prayer[] = data.data.prayers || [];
          
          for (const prayer of partnerPrayers) {
            try {
              await savePrayer(prayer);
            } catch (err) {
              console.error('Error saving partner prayer:', err);
            }
          }
          
          await loadPrayers();
          
          if (partnerPrayers.length > 0) {
            toast({
              title: "Gratitude synced",
              description: `Synced ${partnerPrayers.length} entries with your beloved`,
            });
          }
        }
      } catch (e) {
        console.log('WebSocket message parse error:', e);
      }
    };

    ws.addEventListener('message', handleMessage);
    
    // Request partner's prayer history with retry interval
    const requestPrayerHistory = () => {
      if (ws.readyState === WebSocket.OPEN && partnerId) {
        console.log('Requesting partner prayer history...');
        sendWS({
          type: 'request-prayer-history',
          data: { requesterId: userId },
        });
      }
    };
    
    requestPrayerHistory();
    const historyInterval = setInterval(requestPrayerHistory, 3000);
    
    return () => {
      clearInterval(historyInterval);
      ws.removeEventListener('message', handleMessage);
    };
  }, [ws, partnerId, userId, sendWS]);

  const loadPrayers = async () => {
    const allPrayers = await getAllPrayers();
    
    const prayersByDate = allPrayers.reduce((acc, prayer) => {
      const dateKey = format(new Date(prayer.prayerDate), 'yyyy-MM-dd');
      if (!acc[dateKey]) acc[dateKey] = [];
      acc[dateKey].push(prayer);
      return acc;
    }, {} as Record<string, Prayer[]>);

    Object.keys(prayersByDate).forEach(dateKey => {
      const dayPrayers = prayersByDate[dateKey];
      if (dayPrayers.length === 2) {
        dayPrayers.forEach(p => {
          if (!p.isRevealed) p.isRevealed = true;
        });
      }
    });

    setPrayers(allPrayers);

    const today = format(new Date(), 'yyyy-MM-dd');
    const todayPrayer = allPrayers.find(
      p => format(new Date(p.prayerDate), 'yyyy-MM-dd') === today && p.userId === userId
    );
    setTodaySubmitted(!!todayPrayer);
  };

  const handleSubmit = async () => {
    if (!gratitude.trim() || !userId || !partnerId) {
      toast({
        title: "Incomplete",
        description: "Please share what you're grateful for.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const prayerEntry: Prayer = {
        id: nanoid(),
        pairingId: `${userId}:${partnerId}`,
        userId,
        partnerId,
        gratitudeEntry: gratitude,
        prayerEntry: prayer.trim() || null,
        isRevealed: false,
        prayerDate: new Date(),
        createdAt: new Date(),
      };

      await savePrayer(prayerEntry);
      setPrayers(prev => [...prev, prayerEntry]);
      setTodaySubmitted(true);

      // Send to partner via WebSocket
      sendWS({
        type: 'prayer',
        data: prayerEntry,
      });

      setGratitude('');
      setPrayer('');
      setDialogOpen(false);

      toast({
        title: "Prayer shared 🙏",
        description: "Waiting for your beloved to share theirs.",
      });
    } catch (error) {
      toast({
        title: "Failed to save",
        description: "Could not save prayer. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const today = format(new Date(), 'yyyy-MM-dd');
  const todayPrayers = prayers.filter(p => format(new Date(p.prayerDate), 'yyyy-MM-dd') === today);
  const bothSubmittedToday = todayPrayers.length === 2;
  const revealedPrayers = prayers.filter(p => p.isRevealed && format(new Date(p.prayerDate), 'yyyy-MM-dd') !== today);

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="flex items-center justify-between px-6 py-4 border-b bg-card/50">
        <div>
          <h2 className="text-xl font-light text-foreground">Gratitude & Prayers</h2>
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
            <Lock className="w-3 h-3" />
            Share blessings together
          </p>
        </div>

        {!todaySubmitted && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-prayer">
                <Plus className="w-4 h-4 mr-2" />
                Add
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle className="font-light">Today's Gratitude & Prayer</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">What are you grateful for?</label>
                  <Textarea
                    value={gratitude}
                    onChange={(e) => setGratitude(e.target.value)}
                    placeholder="Share something you're grateful for today..."
                    className="min-h-[100px] resize-none"
                    data-testid="input-gratitude"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">A prayer or blessing (optional)</label>
                  <Textarea
                    value={prayer}
                    onChange={(e) => setPrayer(e.target.value)}
                    placeholder="Share a prayer or blessing..."
                    className="min-h-[100px] resize-none"
                    data-testid="input-prayer"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="ghost"
                    onClick={() => setDialogOpen(false)}
                    data-testid="button-cancel-prayer"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={!gratitude.trim() || saving}
                    data-testid="button-submit-prayer"
                  >
                    Share Today's Entry
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <ScrollArea className="flex-1 p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {todaySubmitted && !bothSubmittedToday && (
            <Card className="p-6 bg-gradient-to-br from-blush/10 to-gold/10 border-blush/30">
              <div className="flex items-start gap-3">
                <Lock className="w-5 h-5 text-blush mt-0.5" />
                <div>
                  <h3 className="font-medium">Today's Gratitude Shared</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Waiting for your beloved to share theirs...
                  </p>
                </div>
              </div>
            </Card>
          )}

          {bothSubmittedToday && (
            <Card className="p-6 bg-gradient-to-br from-sage/10 to-blush/10 border-sage/30">
              <div className="flex items-start gap-3 mb-4">
                <Sparkles className="w-5 h-5 text-sage mt-0.5" />
                <h3 className="font-medium">Today's Shared Gratitude</h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {todayPrayers.map((entry) => (
                  <div key={entry.id} className="space-y-2 p-3 rounded-md bg-background/40">
                    <p className="text-xs font-medium text-muted-foreground">
                      {entry.userId === userId ? 'You' : 'Your beloved'}
                    </p>
                    <p className="text-sm">{entry.gratitudeEntry}</p>
                    {entry.prayerEntry && (
                      <p className="text-sm italic text-muted-foreground mt-2">{entry.prayerEntry}</p>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Past Gratitudes</h3>
            {revealedPrayers.length === 0 ? (
              <Card className="p-8 text-center">
                <Sparkles className="w-12 h-12 mx-auto text-muted-foreground mb-3 opacity-50" />
                <p className="text-muted-foreground">No past entries yet</p>
              </Card>
            ) : (
              <div className="space-y-4">
                {Object.entries(
                  revealedPrayers.reduce((acc, prayer) => {
                    const dateKey = format(new Date(prayer.prayerDate), 'yyyy-MM-dd');
                    if (!acc[dateKey]) acc[dateKey] = [];
                    acc[dateKey].push(prayer);
                    return acc;
                  }, {} as Record<string, Prayer[]>)
                ).map(([dateKey, dayPrayers]) => (
                  <Card key={dateKey} className="p-4 space-y-3">
                    <p className="text-xs font-medium text-muted-foreground">
                      {format(new Date(dateKey), 'MMM d, yyyy')}
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      {dayPrayers.map((entry) => (
                        <div key={entry.id} className="p-3 rounded-md bg-sage/5 border border-sage/20 space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">
                            {entry.userId === userId ? 'You' : 'Your beloved'}
                          </p>
                          <p className="text-sm">{entry.gratitudeEntry}</p>
                          {entry.prayerEntry && (
                            <p className="text-sm italic text-muted-foreground mt-2">{entry.prayerEntry}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
