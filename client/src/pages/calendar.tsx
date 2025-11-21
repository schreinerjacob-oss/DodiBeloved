import { useState, useEffect } from 'react';
import { useDodi } from '@/contexts/DodiContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Calendar as CalendarIcon, Heart, Plus, Sparkles } from 'lucide-react';
import { getAllCalendarEvents } from '@/lib/storage';
import type { CalendarEvent } from '@shared/schema';
import { format, differenceInDays } from 'date-fns';

export default function CalendarPage() {
  const { userId, partnerId } = useDodi();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [anniversaryDate, setAnniversaryDate] = useState<Date | null>(null);

  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
    const allEvents = await getAllCalendarEvents();
    setEvents(allEvents);
    
    const anniversary = allEvents.find(e => e.isAnniversary);
    if (anniversary) {
      setAnniversaryDate(new Date(anniversary.eventDate));
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

        <Button data-testid="button-add-event">
          <Plus className="w-4 h-4 mr-2" />
          Add Event
        </Button>
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
              <Button className="mt-4" data-testid="button-create-first-event">
                <Plus className="w-4 h-4 mr-2" />
                Add Your First Event
              </Button>
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
