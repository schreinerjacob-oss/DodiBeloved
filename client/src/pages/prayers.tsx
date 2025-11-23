import { useState, useEffect } from 'react';
import { useDodi } from '@/contexts/DodiContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Sparkles, Lock, Plus } from 'lucide-react';
import { getAllPrayers, savePrayer } from '@/lib/storage-encrypted';
import type { Prayer } from '@shared/schema';
import { nanoid } from 'nanoid';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

export default function PrayersPage() {
  const { userId, partnerId } = useDodi();
  const { toast } = useToast();
  const [prayers, setPrayers] = useState<Prayer[]>([]);
  const [gratitude, setGratitude] = useState('');
  const [prayer, setPrayer] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [todaySubmitted, setTodaySubmitted] = useState(false);

  useEffect(() => {
    loadPrayers();
  }, []);

  const loadPrayers = async () => {
    const allPrayers = await getAllPrayers();
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
        participantIds: JSON.stringify([userId]),
        isRevealed: false,
        prayerDate: new Date(),
      };

      await savePrayer(prayerEntry);
      setPrayers(prev => [...prev, prayerEntry]);
      setTodaySubmitted(true);

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

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="flex items-center justify-between px-6 py-4 border-b bg-card/50">
        <div>
          <h2 className="text-xl font-light text-foreground">Prayers & Gratitude</h2>
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
          {todaySubmitted && todayPrayers.length > 0 && (
            <Card className="p-6 bg-gradient-to-br from-sage/10 to-blush/10 border-sage/30">
              <div className="flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-sage mt-0.5" />
                <div>
                  <h3 className="font-medium">Today's Gratitude Shared</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Waiting to reveal both entries together...
                  </p>
                </div>
              </div>
            </Card>
          )}

          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Past Gratitudes</h3>
            {prayers.length === 0 ? (
              <Card className="p-8 text-center">
                <Sparkles className="w-12 h-12 mx-auto text-muted-foreground mb-3 opacity-50" />
                <p className="text-muted-foreground">No entries yet</p>
              </Card>
            ) : (
              <div className="space-y-3">
                {prayers.map((entry) => (
                  <Card
                    key={entry.id}
                    className="p-4 space-y-2"
                    data-testid={`card-prayer-${entry.id}`}
                  >
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(entry.prayerDate), 'MMM d, yyyy')}
                    </p>
                    <p className="text-sm">{entry.gratitudeEntry}</p>
                    {entry.prayerEntry && (
                      <p className="text-sm italic text-muted-foreground">{entry.prayerEntry}</p>
                    )}
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
