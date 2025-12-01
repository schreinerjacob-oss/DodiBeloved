import { useState, useEffect } from 'react';
import { useDodi } from '@/contexts/DodiContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Clock, Lock, Heart, Plus } from 'lucide-react';
import { getAllFutureLetters, saveFutureLetter } from '@/lib/storage-encrypted';
import type { FutureLetter } from '@/types';
import { nanoid } from 'nanoid';
import { useToast } from '@/hooks/use-toast';
import { format, isPast } from 'date-fns';
import { usePeerConnection } from '@/hooks/use-peer-connection';

export default function FutureLettersPage() {
  const { userId, partnerId } = useDodi();
  const { toast } = useToast();
  const { send: sendP2P, state: peerState } = usePeerConnection();
  const [letters, setLetters] = useState<FutureLetter[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [unlockDate, setUnlockDate] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadLetters();
  }, []);

  // Listen for incoming future letters from partner and handle history sync
  useEffect(() => {
    if (!peerState.connected || !partnerId) return;

    const handleP2pMessage = async (event: CustomEvent) => {
      try {
        const data = event.detail;
        
        if (data.type === 'future-letter') {
          console.log('Received future letter from partner:', data.data);
          const incomingLetter = data.data;
          
          if (incomingLetter.recipientId === userId && incomingLetter.authorId === partnerId) {
            await saveFutureLetter(incomingLetter);
            setLetters(prev => {
              if (prev.some(l => l.id === incomingLetter.id)) {
                return prev;
              }
              return [...prev, incomingLetter];
            });
          }
        } else if (data.type === 'request-future-letter-history') {
          console.log('Partner requesting future letter history, sending...');
          const allLetters = await getAllFutureLetters();
          const relevantLetters = allLetters.filter(
            l => (l.authorId === userId && l.recipientId === partnerId) ||
                 (l.authorId === partnerId && l.recipientId === userId)
          );
          
          sendP2P({
            type: 'future-letter-history-response',
            data: { letters: relevantLetters, partnerId: partnerId },
          });
        } else if (data.type === 'future-letter-history-response') {
          console.log('Received future letter history from partner');
          const partnerLetters: FutureLetter[] = data.data.letters || [];
          
          for (const letter of partnerLetters) {
            try {
              await saveFutureLetter(letter);
            } catch (err) {
              console.error('Error saving partner future letter:', err);
            }
          }
          
          await loadLetters();
          
          if (partnerLetters.length > 0) {
            toast({
              title: "Future letters synced",
              description: `Synced ${partnerLetters.length} letters with your beloved`,
            });
          }
        }
      } catch (e) {
        console.log('WebSocket message parse error:', e);
      }
    };

    window.addEventListener('p2p-message', handleP2pMessage as EventListener);
    
    // Request partner's future letter history with retry interval
    const requestFutureLetterHistory = () => {
      if (peerState.connected && partnerId) {
        console.log('Requesting partner future letter history...');
        sendP2P({
          type: 'request-future-letter-history',
          data: { requesterId: userId },
        });
      }
    };
    
    requestFutureLetterHistory();
    const historyInterval = setInterval(requestFutureLetterHistory, 3000);
    
    return () => {
      clearInterval(historyInterval);
      window.removeEventListener('p2p-message', handleP2pMessage as EventListener);
    };
  }, [peerState.connected, partnerId, userId, sendP2P]);

  const loadLetters = async () => {
    const allLetters = await getAllFutureLetters();
    setLetters(allLetters);
  };

  const handleSave = async () => {
    if (!content.trim() || !unlockDate || !userId || !partnerId) {
      toast({
        title: "Incomplete",
        description: "Please enter content and choose an unlock date.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const letter: FutureLetter = {
        id: nanoid(),
        authorId: userId,
        recipientId: partnerId,
        title: title.trim() || 'Untitled',
        content,
        unlockDate: new Date(unlockDate),
        isUnlocked: false,
        createdAt: new Date(),
      };

      await saveFutureLetter(letter);
      setLetters(prev => [...prev, letter]);
      
      // Send to partner via WebSocket
      sendP2P({
        type: 'future-letter',
        data: letter,
      });

      setTitle('');
      setContent('');
      setUnlockDate('');
      setDialogOpen(false);

      toast({
        title: "Letter scheduled ⏰",
        description: "Your letter will be revealed on the chosen date and shared.",
      });
    } catch (error) {
      toast({
        title: "Failed to save",
        description: "Could not save letter. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="flex items-center justify-between px-6 py-4 border-b bg-card/50">
        <div>
          <h2 className="text-xl font-light text-foreground">Future Letters</h2>
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
            <Clock className="w-3 h-3" />
            Letters to unlock tomorrow
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-schedule-letter">
              <Plus className="w-4 h-4 mr-2" />
              Schedule
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="font-light">Write a Letter for Tomorrow</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Letter title (optional)"
                data-testid="input-future-title"
              />
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write a message to be revealed on a special date..."
                className="min-h-[200px] resize-none"
                data-testid="input-future-content"
              />
              <div>
                <label className="text-sm font-medium mb-1 block">Unlock Date</label>
                <Input
                  type="date"
                  value={unlockDate}
                  onChange={(e) => setUnlockDate(e.target.value)}
                  data-testid="input-unlock-date"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  variant="ghost"
                  onClick={() => setDialogOpen(false)}
                  data-testid="button-cancel-future"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={!content.trim() || !unlockDate || saving}
                  data-testid="button-save-future"
                >
                  Schedule Letter
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <ScrollArea className="flex-1 p-6">
        <div className="max-w-2xl mx-auto space-y-4">
          {letters.length === 0 && (
            <Card className="p-8 text-center">
              <Clock className="w-12 h-12 mx-auto text-muted-foreground mb-3 opacity-50" />
              <p className="text-muted-foreground">No scheduled letters yet</p>
              <p className="text-xs text-muted-foreground mt-1">Write a letter to be revealed on a special date</p>
            </Card>
          )}

          {letters.map((letter) => {
            const isUnlocked = isPast(new Date(letter.unlockDate)) || letter.isUnlocked;
            return (
              <Card
                key={letter.id}
                className={`p-4 space-y-2 ${
                  isUnlocked ? 'border-sage/40 bg-sage/5' : 'border-muted/40 opacity-75'
                }`}
                data-testid={`card-future-letter-${letter.id}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-medium text-sm">{letter.title}</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      {isUnlocked ? '✓ ' : '⏰ '} 
                      {format(new Date(letter.unlockDate), 'MMM d, yyyy')}
                    </p>
                  </div>
                  {isUnlocked ? (
                    <Heart className="w-4 h-4 text-sage flex-shrink-0" />
                  ) : (
                    <Lock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  )}
                </div>
                {isUnlocked ? (
                  <p className="text-sm mt-3 pt-3 border-t">{letter.content}</p>
                ) : (
                  <p className="text-sm mt-3 pt-3 border-t text-muted-foreground italic">
                    This letter will be revealed on {format(new Date(letter.unlockDate), 'MMMM d, yyyy')}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
