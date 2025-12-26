import { useState, useEffect } from 'react';
import { useDodi } from '@/contexts/DodiContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Heart, Sparkles, Send, Smile, Star, Cloud, Sun, Moon } from 'lucide-react';
import { getAllDailyRituals, saveDailyRitual } from '@/lib/storage-encrypted';
import type { DailyRitual } from '@/types';
import { nanoid } from 'nanoid';
import { useToast } from '@/hooks/use-toast';
import { format, isToday } from 'date-fns';
import { usePeerConnection } from '@/hooks/use-peer-connection';
import { cn } from '@/lib/utils';

const quickMoods = [
  { id: 'love', icon: Heart, label: 'Feeling loved', color: 'text-accent' },
  { id: 'happy', icon: Sun, label: 'Happy', color: 'text-yellow-500' },
  { id: 'grateful', icon: Star, label: 'Grateful', color: 'text-gold' },
  { id: 'peaceful', icon: Moon, label: 'Peaceful', color: 'text-primary' },
  { id: 'thinking', icon: Cloud, label: 'Thinking of you', color: 'text-blue-400' },
  { id: 'missing', icon: Sparkles, label: 'Missing you', color: 'text-blush' },
];

export default function DailyWhisperPage() {
  const { userId, partnerId } = useDodi();
  const { toast } = useToast();
  const { send: sendP2P, state: peerState } = usePeerConnection();
  const [whispers, setWhispers] = useState<DailyRitual[]>([]);
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [gratitudeNote, setGratitudeNote] = useState('');
  const [sending, setSending] = useState(false);
  const [todaySent, setTodaySent] = useState(false);

  useEffect(() => {
    loadWhispers();
  }, []);

  useEffect(() => {
    const handleWhisperSynced = (event: CustomEvent) => {
      const incomingWhisper = event.detail as DailyRitual;
      setWhispers(prev => {
        if (prev.some(w => w.id === incomingWhisper.id)) return prev;
        return [incomingWhisper, ...prev];
      });
    };

    window.addEventListener('ritual-synced', handleWhisperSynced as EventListener);
    return () => window.removeEventListener('ritual-synced', handleWhisperSynced as EventListener);
  }, []);

  const loadWhispers = async () => {
    const all = await getAllDailyRituals();
    const sorted = all.sort((a, b) => 
      new Date(b.ritualDate).getTime() - new Date(a.ritualDate).getTime()
    );
    setWhispers(sorted);
    
    const todayWhisper = sorted.find(w => 
      w.userId === userId && isToday(new Date(w.ritualDate))
    );
    setTodaySent(!!todayWhisper);
  };

  const handleSend = async () => {
    if (!selectedMood || !userId || !partnerId) return;

    setSending(true);
    try {
      const whisper: DailyRitual = {
        id: nanoid(),
        userId,
        partnerId,
        emotion: selectedMood,
        lovedMoment: '',
        gratitude: gratitudeNote.trim(),
        tomorrowNeed: '',
        ritualDate: new Date(),
        createdAt: new Date(),
      };

      await saveDailyRitual(whisper);
      setWhispers(prev => [whisper, ...prev]);
      setTodaySent(true);

      sendP2P({
        type: 'daily_ritual',
        data: whisper,
        timestamp: Date.now(),
      });

      setSelectedMood(null);
      setGratitudeNote('');

      toast({
        title: "Whisper sent",
        description: "Your beloved will see your mood",
      });
    } catch (error) {
      toast({
        title: "Failed to send",
        description: "Please try again",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const getMoodInfo = (id: string) => quickMoods.find(m => m.id === id);

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="px-6 py-4 border-b bg-card/50">
        <h2 className="text-xl font-light text-foreground">Daily Whisper</h2>
        <p className="text-xs text-muted-foreground mt-1">
          One tap to share how you feel
        </p>
      </div>

      <ScrollArea className="flex-1 p-6">
        <div className="max-w-md mx-auto space-y-6">
          {!todaySent ? (
            <Card className="p-6 space-y-5 border-primary/20">
              <div className="text-center">
                <h3 className="font-medium mb-1">How are you feeling?</h3>
                <p className="text-xs text-muted-foreground">Tap to send a quick mood</p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {quickMoods.map((mood) => {
                  const Icon = mood.icon;
                  const isSelected = selectedMood === mood.id;
                  return (
                    <button
                      key={mood.id}
                      onClick={() => setSelectedMood(mood.id)}
                      className={cn(
                        'flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all hover-elevate',
                        isSelected ? 'border-primary bg-primary/10' : 'border-border'
                      )}
                      data-testid={`button-mood-${mood.id}`}
                    >
                      <Icon className={cn('w-8 h-8', mood.color)} />
                      <span className="text-xs">{mood.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">
                  Add a note (optional)
                </label>
                <Input
                  value={gratitudeNote}
                  onChange={(e) => setGratitudeNote(e.target.value)}
                  placeholder="One thing I'm grateful for..."
                  maxLength={100}
                  data-testid="input-gratitude-note"
                />
              </div>

              <Button
                onClick={handleSend}
                disabled={!selectedMood || sending}
                className="w-full"
                data-testid="button-send-whisper"
              >
                <Send className="w-4 h-4 mr-2" />
                Send Whisper
              </Button>
            </Card>
          ) : (
            <Card className="p-6 bg-gradient-to-br from-primary/10 to-accent/10 border-primary/30">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                  <Sparkles className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-medium">Today's whisper sent</h3>
                  <p className="text-sm text-muted-foreground">
                    Come back tomorrow
                  </p>
                </div>
              </div>
            </Card>
          )}

          {whispers.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">Recent Whispers</h3>
              {whispers.slice(0, 10).map((whisper) => {
                const moodInfo = getMoodInfo(whisper.emotion);
                const Icon = moodInfo?.icon || Smile;
                const isFromPartner = whisper.userId === partnerId;
                
                return (
                  <Card
                    key={whisper.id}
                    className={cn(
                      'p-4',
                      isFromPartner && 'bg-accent/5 border-accent/20'
                    )}
                    data-testid={`whisper-${whisper.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        'w-10 h-10 rounded-full flex items-center justify-center',
                        isFromPartner ? 'bg-accent/20' : 'bg-primary/20'
                      )}>
                        <Icon className={cn('w-5 h-5', moodInfo?.color || 'text-muted-foreground')} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">
                            {isFromPartner ? 'Your beloved' : 'You'}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(whisper.ritualDate), 'MMM d')}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {moodInfo?.label || whisper.emotion}
                        </p>
                        {whisper.gratitude && (
                          <p className="text-sm mt-1 text-foreground/80">
                            "{whisper.gratitude}"
                          </p>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
