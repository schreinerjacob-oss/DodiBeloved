import { useState, useEffect } from 'react';
import { useDodi } from '@/contexts/DodiContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Calendar as CalendarIcon, Heart, Plus, Sparkles } from 'lucide-react';
import { getAllCalendarEvents, saveCalendarEvent } from '@/lib/storage-encrypted';
import type { CalendarEvent } from '@/types';
import { format, differenceInDays } from 'date-fns';
import { nanoid } from 'nanoid';
import { useToast } from '@/hooks/use-toast';
import { usePeerConnection } from '@/hooks/use-peer-connection';

export default function CalendarPage() {
  const { userId, partnerId } = useDodi();
  const { toast } = useToast();
  const { send: sendP2P, state: peerState } = usePeerConnection();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [anniversaryDate, setAnniversaryDate] = useState<Date | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [isAnniversary, setIsAnniversary] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadEvents();
  }, []);

  // Listen for incoming events from partner and handle history sync
  useEffect(() => {
    if (!peerState.connected || !partnerId) return;

    const handleP2pMessage = async (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'calendar') {
          console.log('Received calendar event from partner:', data.data);
          const incomingEvent = data.data;
          
          // Accept events between us and our partner (either direction)
          const isOurEvent = (incomingEvent.userId === userId && incomingEvent.partnerId === partnerId) ||
                            (incomingEvent.userId === partnerId && incomingEvent.partnerId === userId);
          
          if (isOurEvent) {
            await saveCalendarEvent(incomingEvent);
            setEvents(prev => {
              if (prev.some(e => e.id === incomingEvent.id)) {
                return prev;
              }
              return [...prev, incomingEvent];
            });
            
            if (incomingEvent.isAnniversary) {
              setAnniversaryDate(new Date(incomingEvent.eventDate));
            }
          }
        } else if (data.type === 'request-calendar-history') {
          console.log('Partner requesting calendar history, sending...');
          const allEvents = await getAllCalendarEvents();
          const relevantEvents = allEvents.filter(
            e => (e.userId === userId && e.partnerId === partnerId) ||
                 (e.userId === partnerId && e.partnerId === userId)
          );
          
          sendP2P({
            type: 'calendar-history-response',
            data: { events: relevantEvents, partnerId: partnerId },
          });
        } else if (data.type === 'calendar-history-response') {
          console.log('Received calendar history from partner');
          const partnerEvents: CalendarEvent[] = data.data.events || [];
          
          for (const event of partnerEvents) {
            try {
              await saveCalendarEvent(event);
            } catch (err) {
              console.error('Error saving partner event:', err);
            }
          }
          
          await loadEvents();
          
          if (partnerEvents.length > 0) {
            toast({
              title: "Calendar synced",
              description: `Synced ${partnerEvents.length} events with your beloved`,
            });
          }
        }
      } catch (e) {
        console.log('WebSocket message parse error:', e);
      }
    };

    window.addEventListener('p2p-message', handleP2pMessage as EventListener);
    
    // Request partner's calendar history with retry interval
    const requestCalendarHistory = () => {
      if (peerState.connected && partnerId) {
        console.log('Requesting partner calendar history...');
        sendP2P({
          type: 'request-calendar-history',
          data: { requesterId: userId },
        });
      }
    };
    
    requestCalendarHistory();
    const historyInterval = setInterval(requestCalendarHistory, 3000);
    
    return () => {
      clearInterval(historyInterval);
      window.removeEventListener('p2p-message', handleP2pMessage as EventListener);
    };
  }, [ws, partnerId, userId, sendWS]);

  const loadEvents = async () => {
    const allEvents = await getAllCalendarEvents();
    setEvents(allEvents);
    
    const anniversary = allEvents.find(e => e.isAnniversary);
    if (anniversary) {
      setAnniversaryDate(new Date(anniversary.eventDate));
    }
  };

  const handleSaveEvent = async () => {
    if (!title.trim() || !eventDate || !userId || !partnerId) {
      toast({
        title: "Missing information",
        description: "Please provide a title and date for the event.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const newEvent: CalendarEvent = {
        id: nanoid(),
        userId,
        partnerId,
        title: title.trim(),
        description: description.trim() || null,
        eventDate: new Date(eventDate),
        isAnniversary,
        createdAt: new Date(),
      };

      // Save to local IndexedDB first
      await saveCalendarEvent(newEvent);

      // Add to local state immediately
      setEvents(prev => [...prev, newEvent]);
      
      // Update anniversary if needed
      if (isAnniversary) {
        setAnniversaryDate(new Date(eventDate));
      }

      // Send to partner via WebSocket
      sendP2P({
        type: 'calendar',
        data: newEvent,
      });

      // Reset form
      setTitle('');
      setDescription('');
      setEventDate('');
      setIsAnniversary(false);
      setDialogOpen(false);

      toast({
        title: "Event saved 📅",
        description: "Your special date has been added.",
      });
    } catch (error) {
      console.error('Save event error:', error);
      toast({
        title: "Failed to save",
        description: "Could not save event. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const daysTogether = anniversaryDate
    ? differenceInDays(new Date(), anniversaryDate)
    : 0;

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="flex items-center justify-between px-6 py-4 border-b bg-card/50">
        <div>
          <h2 className="text-xl font-light text-foreground">Our Calendar</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Special moments and milestones
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-event">
              <Plus className="w-4 h-4 mr-2" />
              Add Event
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="font-light">Add Special Date</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="event-title">Title</Label>
                <Input
                  id="event-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Our Anniversary"
                  data-testid="input-event-title"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="event-date">Date</Label>
                <Input
                  id="event-date"
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  data-testid="input-event-date"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="event-description">Description (optional)</Label>
                <Textarea
                  id="event-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add details about this special day..."
                  rows={3}
                  data-testid="input-event-description"
                />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="is-anniversary"
                  checked={isAnniversary}
                  onCheckedChange={(checked) => setIsAnniversary(checked as boolean)}
                  data-testid="checkbox-anniversary"
                />
                <Label
                  htmlFor="is-anniversary"
                  className="text-sm font-normal cursor-pointer"
                >
                  This is our anniversary (when we got together)
                </Label>
              </div>

              <Button
                onClick={handleSaveEvent}
                disabled={!title.trim() || !eventDate || saving}
                className="w-full"
                data-testid="button-save-event"
              >
                {saving ? 'Saving...' : 'Save Event'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <ScrollArea className="flex-1 p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {anniversaryDate && (
            <Card className="p-6 bg-gradient-to-br from-sage/10 via-accent/5 to-blush/10 border-gold/30">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-gold/20 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-6 h-6 text-gold animate-pulse-glow" />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium text-lg flex items-center gap-2">
                    Together Since
                    <Heart className="w-4 h-4 text-accent" />
                  </h3>
                  <p className="text-3xl font-light mt-2 text-foreground" data-testid="text-days-together">
                    {daysTogether} <span className="text-base text-muted-foreground">days</span>
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {format(anniversaryDate, 'MMMM d, yyyy')}
                  </p>
                </div>
              </div>
            </Card>
          )}

          {events.length === 0 ? (
            <div className="text-center py-16 space-y-4">
              <div className="w-20 h-20 mx-auto rounded-full bg-blush/20 flex items-center justify-center">
                <CalendarIcon className="w-10 h-10 text-blush" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-light">No events yet</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                  Mark your special dates, anniversaries, and important moments to celebrate together.
                </p>
              </div>
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="mt-4" data-testid="button-create-first-event">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Your First Event
                  </Button>
                </DialogTrigger>
              </Dialog>
            </div>
          ) : (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">Upcoming Events</h3>
              {events
                .filter(e => !e.isAnniversary)
                .map(event => (
                  <Card
                    key={event.id}
                    className="p-4 hover-elevate cursor-pointer"
                    data-testid={`event-${event.id}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 rounded-lg bg-accent/10 flex flex-col items-center justify-center text-accent flex-shrink-0">
                        <span className="text-xs font-medium">
                          {format(new Date(event.eventDate), 'MMM')}
                        </span>
                        <span className="text-lg font-light">
                          {format(new Date(event.eventDate), 'd')}
                        </span>
                      </div>
                      <div className="flex-1">
                        <h4 className="font-medium">{event.title}</h4>
                        {event.description && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {event.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
