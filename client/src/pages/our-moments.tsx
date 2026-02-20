import { useState, useEffect } from 'react';
import { useDodi } from '@/contexts/DodiContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CalendarHeart, Heart, Plus, Sparkles, FileText, MessageCircle, User } from 'lucide-react';
import { getSetting, getAllCalendarEvents, saveCalendarEvent } from '@/lib/storage-encrypted';
import type { CalendarEvent } from '@/types';
import { format, differenceInDays, differenceInYears, differenceInMonths } from 'date-fns';
import { nanoid } from 'nanoid';
import { useToast } from '@/hooks/use-toast';
import { usePeerConnection } from '@/hooks/use-peer-connection';
import { useLocation } from 'wouter';
import { SavedPartnerDetailsTab } from '@/components/moments/saved-partner-details-tab';
import { MakingNewMomentsTab } from '@/components/moments/making-new-moments-tab';
import { MyBelovedTab } from '@/components/moments/my-beloved-tab';

const MAX_MOMENTS = 10;

export default function OurMomentsPage() {
  const { userId, partnerId } = useDodi();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { send: sendP2P, state: peerState } = usePeerConnection();
  const [moments, setMoments] = useState<CalendarEvent[]>([]);
  const [anniversary, setAnniversary] = useState<CalendarEvent | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [isAnniversary, setIsAnniversary] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadMoments();
  }, []);

  // Ensure Birthday calendar event exists when birthday is in settings (from profile setup).
  // Use next occurring birthday (current or next year), not the birth year.
  useEffect(() => {
    if (!userId || !partnerId) return;
    let cancelled = false;
    (async () => {
      const birthdaySetting = await getSetting('birthday');
      if (!birthdaySetting || cancelled) return;
      const all = await getAllCalendarEvents();
      const birthdayId = `birthday-${userId}`;
      if (all.some(e => e.id === birthdayId)) return;
      // Parse as calendar date (YYYY-MM-DD) to avoid timezone shifting the day (e.g. UTC+12 making Jan 15 become Jan 16)
      const parts = birthdaySetting.split('-').map(Number);
      if (parts.length !== 3 || parts.some(Number.isNaN)) return;
      const [birthY, birthM, birthD] = parts;
      if (birthM < 1 || birthM > 12 || birthD < 1 || birthD > 31) return;
      const month = birthM - 1; // 0-indexed for Date
      const day = birthD;
      const now = new Date();
      // Clamp day to last day of month for target year (e.g. Feb 29 → Feb 28 in non-leap years)
      const clampDayForMonth = (y: number, m: number, d: number) =>
        Math.min(d, new Date(y, m + 1, 0).getDate());
      const year1 = now.getFullYear();
      const day1 = clampDayForMonth(year1, month, day);
      let eventDate = new Date(year1, month, day1);
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (eventDate.getTime() < todayStart.getTime()) {
        const year2 = year1 + 1;
        const day2 = clampDayForMonth(year2, month, day);
        eventDate = new Date(year2, month, day2);
      }
      const moment: CalendarEvent = {
        id: birthdayId,
        userId,
        partnerId,
        title: 'Birthday',
        description: null,
        eventDate,
        isAnniversary: false,
        createdAt: new Date(),
      };
      await saveCalendarEvent(moment);
      if (cancelled) return;
      sendP2P({ type: 'calendar_event', data: moment, timestamp: Date.now() });
      loadMoments();
    })();
    return () => { cancelled = true; };
  }, [userId, partnerId]);

  useEffect(() => {
    const handleCalendarSynced = (event: CustomEvent) => {
      loadMoments();
    };
    window.addEventListener('calendar-synced', handleCalendarSynced as EventListener);
    return () => window.removeEventListener('calendar-synced', handleCalendarSynced as EventListener);
  }, []);

  const loadMoments = async () => {
    const all = await getAllCalendarEvents();
    const anniv = all.find(e => e.isAnniversary);
    setAnniversary(anniv || null);
    
    const others = all
      .filter(e => !e.isAnniversary)
      .sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime());
    setMoments(others);
  };

  const handleSave = async () => {
    if (!title.trim() || !eventDate || !userId || !partnerId) {
      toast({
        title: "Missing info",
        description: "Please add a title and date",
        variant: "destructive",
      });
      return;
    }

    const nonBirthdayCount = moments.filter(m => !m.id.startsWith('birthday-')).length;
    if (!isAnniversary && nonBirthdayCount >= MAX_MOMENTS) {
      toast({
        title: "Limit reached",
        description: `You can save up to ${MAX_MOMENTS} special dates`,
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const moment: CalendarEvent = {
        id: nanoid(),
        userId,
        partnerId,
        title: title.trim(),
        description: null,
        eventDate: new Date(eventDate),
        isAnniversary,
        createdAt: new Date(),
      };

      await saveCalendarEvent(moment);
      
      if (isAnniversary) {
        setAnniversary(moment);
      } else {
        setMoments(prev => [...prev, moment].sort((a, b) => 
          new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime()
        ));
      }

      sendP2P({
        type: 'calendar_event',
        data: moment,
        timestamp: Date.now(),
      });

      setTitle('');
      setEventDate('');
      setIsAnniversary(false);
      setDialogOpen(false);

      toast({
        title: "Moment saved",
        description: isAnniversary ? "Your anniversary has been set" : "Special date added",
      });
    } catch (error) {
      toast({
        title: "Failed to save",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const formatTimeTogether = () => {
    if (!anniversary) return null;
    const start = new Date(anniversary.eventDate);
    const now = new Date();
    const years = differenceInYears(now, start);
    const months = differenceInMonths(now, start) % 12;
    const days = differenceInDays(now, start);
    
    if (years > 0) {
      return { main: years, unit: years === 1 ? 'year' : 'years', sub: `${months} months` };
    } else if (months > 0) {
      return { main: months, unit: months === 1 ? 'month' : 'months', sub: `${days % 30} days` };
    }
    return { main: days, unit: days === 1 ? 'day' : 'days', sub: null };
  };

  const timeTogether = formatTimeTogether();

  const [activeTab, setActiveTab] = useState('dates');

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-background">
      <div className="px-6 py-4 border-b bg-card/50">
        <h2 className="text-xl font-light text-foreground">Moments</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Connect and grow deeper
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <div className="px-6 py-2 border-b bg-card/30">
          <TabsList className="grid grid-cols-4 w-full max-w-md mx-auto h-11 bg-muted/50 p-1">
            <TabsTrigger value="dates" className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg text-xs px-2">
              <CalendarHeart className="w-4 h-4 shrink-0 mr-1" />
              Dates
            </TabsTrigger>
            <TabsTrigger value="details" className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg text-xs px-2">
              <FileText className="w-4 h-4 shrink-0 mr-1" />
              Details
            </TabsTrigger>
            <TabsTrigger value="questions" className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg text-xs px-2">
              <MessageCircle className="w-4 h-4 shrink-0 mr-1" />
              Questions
            </TabsTrigger>
            <TabsTrigger value="beloved" className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg text-xs px-2">
              <User className="w-4 h-4 shrink-0 mr-1" />
              Beloved
            </TabsTrigger>
          </TabsList>
        </div>

        <ScrollArea className="flex-1 min-h-0 p-6">
          <div className="max-w-md mx-auto">
            <TabsContent value="dates" className="mt-0 space-y-6">
              <div className="flex justify-end">
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" data-testid="button-add-moment">
                      <Plus className="w-4 h-4 mr-1" />
                      Add
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-sm">
                    <DialogHeader>
                      <DialogTitle className="font-light">Add Special Date</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                      <Input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="What's the occasion?"
                        data-testid="input-moment-title"
                      />
                      <Input
                        type="date"
                        value={eventDate}
                        onChange={(e) => setEventDate(e.target.value)}
                        data-testid="input-moment-date"
                      />
                      {!anniversary && (
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isAnniversary}
                            onChange={(e) => setIsAnniversary(e.target.checked)}
                            className="rounded border-border"
                          />
                          <span className="text-sm">This is when we got together</span>
                        </label>
                      )}
                      <Button
                        onClick={handleSave}
                        disabled={!title.trim() || !eventDate || saving}
                        className="w-full"
                        data-testid="button-save-moment"
                      >
                        {saving ? 'Saving...' : 'Save'}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
              {anniversary && timeTogether && (
            <Card className="p-6 bg-gradient-to-br from-primary/10 via-accent/5 to-blush/10 border-gold/30">
              <div className="text-center space-y-3">
                <div className="w-14 h-14 mx-auto rounded-full bg-gold/20 flex items-center justify-center">
                  <Sparkles className="w-7 h-7 text-gold animate-pulse-glow" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Together for</p>
                  <p className="text-4xl font-light mt-1" data-testid="text-time-together">
                    {timeTogether.main} <span className="text-lg text-muted-foreground">{timeTogether.unit}</span>
                  </p>
                  {timeTogether.sub && (
                    <p className="text-sm text-muted-foreground">{timeTogether.sub}</p>
                  )}
                </div>
                <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <Heart className="w-3 h-3 text-accent" />
                  Since {format(new Date(anniversary.eventDate), 'MMMM d, yyyy')}
                </p>
              </div>
            </Card>
          )}

          {!anniversary && moments.length === 0 && (
            <div className="text-center py-12 space-y-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-accent/20 flex items-center justify-center">
                <CalendarHeart className="w-8 h-8 text-accent" />
              </div>
              <div className="space-y-2">
                <h3 className="font-medium">No moments yet</h3>
                <p className="text-sm text-muted-foreground">
                  Add your anniversary and special dates
                </p>
              </div>
              <Button onClick={() => setDialogOpen(true)} data-testid="button-add-first">
                <Plus className="w-4 h-4 mr-2" />
                Add Your First Date
              </Button>
            </div>
          )}

          {moments.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-muted-foreground">Special Dates</h3>
                <span className="text-xs text-muted-foreground">{moments.filter(m => !m.id.startsWith('birthday-')).length}/{MAX_MOMENTS}</span>
              </div>
              {moments.map((moment) => (
                <Card
                  key={moment.id}
                  className="p-4 hover-elevate"
                  data-testid={`moment-${moment.id}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-accent/10 flex flex-col items-center justify-center text-accent">
                      <span className="text-xs font-medium">
                        {format(new Date(moment.eventDate), 'MMM')}
                      </span>
                      <span className="text-lg font-light">
                        {format(new Date(moment.eventDate), 'd')}
                      </span>
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium">{moment.title}</h4>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(moment.eventDate), 'yyyy')}
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

              <div className="pt-4 border-t space-y-2">
                <Button
                  variant="ghost"
                  className="w-full justify-start text-muted-foreground"
                  onClick={() => setLocation('/heart-space')}
                  data-testid="link-heart-space"
                >
                  <Heart className="w-4 h-4 mr-2" />
                  Heart Space
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="details" className="mt-0">
              <SavedPartnerDetailsTab />
            </TabsContent>

            <TabsContent value="questions" className="mt-0">
              <MakingNewMomentsTab />
            </TabsContent>

            <TabsContent value="beloved" className="mt-0">
              <MyBelovedTab />
            </TabsContent>
          </div>
        </ScrollArea>
      </Tabs>
    </div>
  );
}
