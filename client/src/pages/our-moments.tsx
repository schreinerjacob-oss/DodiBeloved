import { useState, useEffect } from 'react';
import { useDodi } from '@/contexts/DodiContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { CalendarHeart, Heart, Plus, Sparkles, Trash2 } from 'lucide-react';
import { getAllCalendarEvents, saveCalendarEvent, deleteCalendarEvent } from '@/lib/storage-encrypted';
import type { CalendarEvent } from '@/types';
import { format, differenceInDays, differenceInYears, differenceInMonths } from 'date-fns';
import { nanoid } from 'nanoid';
import { useToast } from '@/hooks/use-toast';
import { usePeerConnection } from '@/hooks/use-peer-connection';
import { cn } from '@/lib/utils';
import { Link, useLocation } from 'wouter';

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

    if (!isAnniversary && moments.length >= MAX_MOMENTS) {
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

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-background">
      <div className="flex items-center justify-between px-6 py-4 border-b bg-card/50">
        <div>
          <h2 className="text-xl font-light text-foreground">Our Moments</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Special dates to remember
          </p>
        </div>

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

      <ScrollArea className="flex-1 min-h-0 p-6">
        <div className="max-w-md mx-auto space-y-6">
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
                <span className="text-xs text-muted-foreground">{moments.length}/{MAX_MOMENTS}</span>
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
        </div>
      </ScrollArea>
    </div>
  );
}
