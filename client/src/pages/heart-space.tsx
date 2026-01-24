import { useState, useEffect } from 'react';
import { useDodi } from '@/contexts/DodiContext';
import { usePeerConnection } from '@/hooks/use-peer-connection';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { 
  Heart, Sparkles, Send, Smile, Star, Cloud, Sun, Moon, 
  Pen, Lock, Plus, MessageSquareHeart, ScrollText, HeartHandshake
} from 'lucide-react';
import { 
  getAllDailyRituals, saveDailyRitual, 
  getAllLoveLetters, saveLoveLetter,
  getAllPrayers, savePrayer
} from '@/lib/storage-encrypted';
import type { DailyRitual, LoveLetter, Prayer, SyncMessage } from '@/types';
import { nanoid } from 'nanoid';
import { useToast } from '@/hooks/use-toast';
import { format, isToday } from 'date-fns';
import { cn } from '@/lib/utils';

const quickMoods = [
  { id: 'love', icon: Heart, label: 'Feeling loved', color: 'text-accent' },
  { id: 'happy', icon: Sun, label: 'Happy', color: 'text-yellow-500' },
  { id: 'grateful', icon: Star, label: 'Grateful', color: 'text-gold' },
  { id: 'peaceful', icon: Moon, label: 'Peaceful', color: 'text-primary' },
  { id: 'thinking', icon: Cloud, label: 'Thinking of you', color: 'text-blue-400' },
  { id: 'missing', icon: Sparkles, label: 'Missing you', color: 'text-blush' },
];

export default function HeartSpacePage() {
  const { userId, partnerId } = useDodi();
  const { toast } = useToast();
  const { send: sendP2P, state: peerState } = usePeerConnection();
  
  const [activeTab, setActiveTab] = useState('whispers');
  
  // Whispers state
  const [whispers, setWhispers] = useState<DailyRitual[]>([]);
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [gratitudeNote, setGratitudeNote] = useState('');
  const [todayWhisperSent, setTodayWhisperSent] = useState(false);
  
  // Love Notes state
  const [notes, setNotes] = useState<LoveLetter[]>([]);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [selectedNote, setSelectedNote] = useState<LoveLetter | null>(null);
  
  // Prayers state
  const [prayers, setPrayers] = useState<Prayer[]>([]);
  const [prayerGratitude, setPrayerGratitude] = useState('');
  const [prayerText, setPrayerText] = useState('');
  const [prayerDialogOpen, setPrayerDialogOpen] = useState(false);
  const [todayPrayerSubmitted, setTodayPrayerSubmitted] = useState(false);
  const [celebrationActive, setCelebrationActive] = useState(false);

  useEffect(() => {
    loadAllData();
  }, []);

  useEffect(() => {
    const handleSync = async (event: CustomEvent) => {
      const message = event.detail as any;
      if (message.type === 'daily_ritual') {
        setWhispers(prev => prev.some(w => w.id === message.data.id) ? prev : [message.data, ...prev]);
      } else if (message.type === 'love_letter') {
        setNotes(prev => prev.some(n => n.id === message.data.id) ? prev : [message.data, ...prev]);
      } else if (message.type === 'prayer') {
        handleIncomingPrayer(message.data);
      }
    };
    
    window.addEventListener('p2p-message', handleSync as unknown as EventListener);
    return () => window.removeEventListener('p2p-message', handleSync as unknown as EventListener);
  }, [peerState.connected, partnerId, userId]);

  const loadAllData = async () => {
    const [allRituals, allLetters, allPrayers] = await Promise.all([
      getAllDailyRituals(),
      getAllLoveLetters(),
      getAllPrayers()
    ]);

    setWhispers(allRituals.sort((a, b) => new Date(b.ritualDate).getTime() - new Date(a.ritualDate).getTime()));
    setTodayWhisperSent(allRituals.some(w => w.userId === userId && isToday(new Date(w.ritualDate))));

    setNotes(allLetters.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));

    setPrayers(allPrayers);
    const today = format(new Date(), 'yyyy-MM-dd');
    setTodayPrayerSubmitted(allPrayers.some(p => format(new Date(p.prayerDate), 'yyyy-MM-dd') === today && p.userId === userId));
  };

  const handleSendWhisper = async () => {
    if (!selectedMood || !userId || !partnerId) return;
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
    setTodayWhisperSent(true);
    sendP2P({ type: 'daily_ritual', data: whisper, timestamp: Date.now() });
    setSelectedMood(null);
    setGratitudeNote('');
    toast({ title: "Whisper sent", description: "Your beloved will see your mood" });
  };

  const handleSaveNote = async () => {
    if (!noteContent.trim() || !userId || !partnerId) return;
    const note: LoveLetter = {
      id: nanoid(),
      authorId: userId,
      recipientId: partnerId,
      title: noteTitle.trim() || 'A note for you',
      content: noteContent,
      createdAt: new Date(),
    };
    await saveLoveLetter(note);
    setNotes(prev => [note, ...prev]);
    sendP2P({ type: 'love_letter', data: note, timestamp: Date.now() });
    setNoteTitle('');
    setNoteContent('');
    setNoteDialogOpen(false);
    toast({ title: "Note saved", description: "Your love note has been sent" });
  };

  const handleIncomingPrayer = async (incoming: Prayer) => {
    await savePrayer(incoming);
    setPrayers(prev => {
      if (prev.some(p => p.id === incoming.id)) return prev;
      return [...prev, incoming];
    });
    // Simplified check for both submitted
    const today = format(new Date(), 'yyyy-MM-dd');
    const todayPrayers = [...prayers, incoming].filter(p => format(new Date(p.prayerDate), 'yyyy-MM-dd') === today);
    if (todayPrayers.length === 2) {
      toast({ title: "Sacred moment 🙏", description: "Your beloved's gratitude has been revealed." });
    }
  };

  const handlePrayerSubmit = async () => {
    if (!prayerGratitude.trim() || !userId || !partnerId) return;
    const entry: Prayer = {
      id: nanoid(),
      pairingId: `${userId}:${partnerId}`,
      userId,
      partnerId,
      gratitudeEntry: prayerGratitude,
      prayerEntry: prayerText.trim() || null,
      isRevealed: false,
      prayerDate: new Date(),
      createdAt: new Date(),
    };
    await savePrayer(entry);
    setPrayers(prev => [...prev, entry]);
    setTodayPrayerSubmitted(true);
    sendP2P({ type: 'prayer', data: entry, timestamp: Date.now() });
    setPrayerGratitude('');
    setPrayerText('');
    setPrayerDialogOpen(false);
    toast({ title: "Prayer shared 🙏", description: "Waiting for your beloved to share theirs." });
  };

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const todayPrayers = prayers.filter(p => format(new Date(p.prayerDate), 'yyyy-MM-dd') === todayStr);
  const bothSubmittedToday = todayPrayers.length === 2;
  const revealedPrayers = prayers.filter(p => (p.isRevealed || bothSubmittedToday) && format(new Date(p.prayerDate), 'yyyy-MM-dd') !== todayStr);

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="px-6 py-4 border-b bg-card/50">
        <h2 className="text-xl font-light text-foreground flex items-center gap-2">
          <Heart className="w-5 h-5 text-accent fill-accent" />
          Heart Space
        </h2>
        <p className="text-xs text-muted-foreground mt-1">A sanctuary for your shared connection</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <div className="px-6 py-2 border-b bg-card/30">
          <TabsList className="grid grid-cols-3 w-full max-w-md mx-auto h-12 bg-muted/50 p-1">
            <TabsTrigger value="whispers" className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg flex gap-2 h-full">
              <Sparkles className="w-4 h-4" />
              <span className="text-xs">Whispers</span>
            </TabsTrigger>
            <TabsTrigger value="notes" className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg flex gap-2 h-full">
              <ScrollText className="w-4 h-4" />
              <span className="text-xs">Notes</span>
            </TabsTrigger>
            <TabsTrigger value="prayers" className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg flex gap-2 h-full">
              <HeartHandshake className="w-4 h-4" />
              <span className="text-xs">Prayers</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <ScrollArea className="flex-1 p-6">
          <div className="max-w-2xl mx-auto">
            <TabsContent value="whispers" className="mt-0 space-y-6 animate-in fade-in slide-in-from-bottom-2">
              {!todayWhisperSent ? (
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
                        >
                          <Icon className={cn('w-8 h-8', mood.color)} />
                          <span className="text-[10px] text-center">{mood.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  <Input
                    value={gratitudeNote}
                    onChange={(e) => setGratitudeNote(e.target.value)}
                    placeholder="One thing I'm grateful for..."
                    maxLength={100}
                  />
                  <Button onClick={handleSendWhisper} disabled={!selectedMood} className="w-full">
                    <Send className="w-4 h-4 mr-2" />
                    Send Whisper
                  </Button>
                </Card>
              ) : (
                <Card className="p-6 bg-gradient-to-br from-primary/10 to-accent/10 border-primary/30 flex items-center gap-3">
                  <Sparkles className="w-6 h-6 text-primary" />
                  <div>
                    <h3 className="font-medium">Today's whisper sent</h3>
                    <p className="text-xs text-muted-foreground">Come back tomorrow to share your mood again</p>
                  </div>
                </Card>
              )}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Recent Whispers</h3>
                {whispers.map((w) => {
                  const mood = quickMoods.find(m => m.id === w.emotion);
                  const Icon = mood?.icon || Smile;
                  const isFromPartner = w.userId === partnerId;
                  return (
                    <Card key={w.id} className={cn('p-4 flex items-center gap-3', isFromPartner && 'bg-accent/5 border-accent/20')}>
                      <div className={cn('w-10 h-10 rounded-full flex items-center justify-center', isFromPartner ? 'bg-accent/20' : 'bg-primary/20')}>
                        <Icon className={cn('w-5 h-5', mood?.color)} />
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium">{isFromPartner ? 'Your beloved' : 'You'}</span>
                          <span className="text-[10px] text-muted-foreground">{format(new Date(w.ritualDate), 'MMM d')}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{mood?.label || w.emotion}</p>
                        {w.gratitude && <p className="text-sm mt-1 text-foreground/80">"{w.gratitude}"</p>}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </TabsContent>

            <TabsContent value="notes" className="mt-0 space-y-6 animate-in fade-in slide-in-from-bottom-2">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Love Letter Vault</h3>
                <Button size="sm" onClick={() => setNoteDialogOpen(true)}>
                  <Plus className="w-4 h-4 mr-1" />
                  Write
                </Button>
              </div>
              <div className="grid gap-4">
                {notes.map((note) => (
                  <Card key={note.id} className="p-5 hover-elevate cursor-pointer border-accent/20" onClick={() => setSelectedNote(note)}>
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-medium">{note.title}</h4>
                      {note.authorId === partnerId && <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/10 text-accent">From beloved</span>}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2 font-handwritten">{note.content}</p>
                    <p className="text-[10px] text-muted-foreground mt-2">{format(new Date(note.createdAt), 'MMM d, yyyy')}</p>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="prayers" className="mt-0 space-y-6 animate-in fade-in slide-in-from-bottom-2">
              {!todayPrayerSubmitted ? (
                <Card className="p-6 text-center space-y-4 border-blush/20">
                  <HeartHandshake className="w-10 h-10 mx-auto text-blush opacity-50" />
                  <div>
                    <h3 className="font-medium">Share Today's Gratitude</h3>
                    <p className="text-xs text-muted-foreground">What blessings are you thankful for today?</p>
                  </div>
                  <Button onClick={() => setPrayerDialogOpen(true)} className="w-full bg-blush hover:bg-blush/90">
                    <Plus className="w-4 h-4 mr-2" />
                    Share Gratitude
                  </Button>
                </Card>
              ) : (
                <div className="space-y-6">
                  {bothSubmittedToday ? (
                    <Card className="p-6 bg-gradient-to-br from-sage/10 to-blush/10 border-sage/30 space-y-4">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-sage animate-gentle-pulse" />
                        <h3 className="font-medium">Today's Shared Blessings</h3>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        {todayPrayers.map((p) => (
                          <div key={p.id} className="p-3 rounded-lg bg-white/50 space-y-1">
                            <span className="text-[10px] font-bold uppercase tracking-tighter text-muted-foreground">{p.userId === userId ? 'You' : 'Beloved'}</span>
                            <p className="text-sm">{p.gratitudeEntry}</p>
                          </div>
                        ))}
                      </div>
                    </Card>
                  ) : (
                    <Card className="p-6 bg-blush/5 border-blush/20 flex items-center gap-3">
                      <Lock className="w-6 h-6 text-blush" />
                      <div>
                        <h3 className="font-medium">Gratitude Shared</h3>
                        <p className="text-xs text-muted-foreground">Waiting for your beloved to reveal their heart...</p>
                      </div>
                    </Card>
                  )}
                </div>
              )}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Journey of Blessings</h3>
                {revealedPrayers.map((p) => (
                  <Card key={p.id} className="p-4 bg-sage/5 border-sage/10">
                    <p className="text-[10px] text-muted-foreground mb-2">{format(new Date(p.prayerDate), 'MMM d, yyyy')}</p>
                    <div className="flex gap-2 items-start">
                      <div className="w-1.5 h-1.5 rounded-full bg-sage mt-1.5" />
                      <p className="text-sm italic">{p.gratitudeEntry}</p>
                    </div>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </div>
        </ScrollArea>
      </Tabs>

      {/* Write Note Dialog */}
      <Dialog open={noteDialogOpen} onOpenChange={setNoteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Write a Love Note</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <Input value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} placeholder="Title (optional)" />
            <Textarea 
              value={noteContent} 
              onChange={(e) => setNoteContent(e.target.value)} 
              placeholder="Pour your heart out..." 
              className="min-h-[200px] font-handwritten text-lg"
            />
            <Button onClick={handleSaveNote} disabled={!noteContent.trim()} className="w-full">Save and Send</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Share Prayer Dialog */}
      <Dialog open={prayerDialogOpen} onOpenChange={setPrayerDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Today's Gratitude</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <Textarea value={prayerGratitude} onChange={(e) => setPrayerGratitude(e.target.value)} placeholder="What are you grateful for today?" className="min-h-[120px]" />
            <Textarea value={prayerText} onChange={(e) => setPrayerText(e.target.value)} placeholder="A prayer or blessing (optional)" className="min-h-[100px]" />
            <Button onClick={handlePrayerSubmit} disabled={!prayerGratitude.trim()} className="w-full bg-blush">Share with Beloved</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Note Dialog */}
      <Dialog open={!!selectedNote} onOpenChange={() => setSelectedNote(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-light">{selectedNote?.title}</DialogTitle>
            <p className="text-xs text-muted-foreground">{selectedNote && format(new Date(selectedNote.createdAt), 'MMMM d, yyyy')}</p>
          </DialogHeader>
          <div className="mt-4 p-6 bg-cream/30 rounded-xl font-handwritten text-xl leading-relaxed whitespace-pre-wrap">
            {selectedNote?.content}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
