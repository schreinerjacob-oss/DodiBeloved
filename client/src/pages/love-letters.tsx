import { useState, useEffect } from 'react';
import { useDodi } from '@/contexts/DodiContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Pen, Lock, Heart, Plus } from 'lucide-react';
import { getAllLoveLetters, saveLoveLetter } from '@/lib/storage-encrypted';
import { usePeerConnection } from '@/hooks/use-peer-connection';
import type { LoveLetter, SyncMessage } from '@/types';
import { nanoid } from 'nanoid';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

export default function LoveLettersPage() {
  const { userId, partnerId } = useDodi();
  const { toast } = useToast();
  const { send: sendP2P, state: peerState } = usePeerConnection();
  const [letters, setLetters] = useState<LoveLetter[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedLetter, setSelectedLetter] = useState<LoveLetter | null>(null);

  useEffect(() => {
    loadLetters();
  }, []);

  // Listen for incoming letters from partner via P2P
  useEffect(() => {
    if (!peerState.connected || !partnerId) return;

    const handleP2pMessage = async (event: CustomEvent) => {
      try {
        const message: SyncMessage = event.detail;
        
        if (message.type === 'letter') {
          const incomingLetter = message.data as LoveLetter;
          if (incomingLetter.recipientId === userId && incomingLetter.authorId === partnerId) {
            await saveLoveLetter(incomingLetter);
            setLetters(prev => {
              if (prev.some(l => l.id === incomingLetter.id)) {
                return prev;
              }
              return [...prev, incomingLetter];
            });
          }
        }
      } catch (e) {
        console.error('🔗 [P2P] Error handling letter message:', e);
      }
    };

    window.addEventListener('p2p-message', handleP2pMessage as EventListener);
    
    return () => {
      window.removeEventListener('p2p-message', handleP2pMessage as EventListener);
    };
  }, [peerState.connected, partnerId, userId]);

  const loadLetters = async () => {
    const allLetters = await getAllLoveLetters();
    setLetters(allLetters);
  };

  const handleSave = async () => {
    if (!content.trim() || !userId || !partnerId) return;

    setSaving(true);
    try {
      const letter: LoveLetter = {
        id: nanoid(),
        authorId: userId,
        recipientId: partnerId,
        title: title.trim() || 'Untitled',
        content,
        createdAt: new Date(),
      };

      await saveLoveLetter(letter);
      setLetters(prev => [...prev, letter]);
      
      // Send to partner via P2P data channel
      sendP2P({
        type: 'letter',
        data: letter,
        timestamp: Date.now(),
      });

      setTitle('');
      setContent('');
      setDialogOpen(false);

      toast({
        title: "Letter saved 💕",
        description: "Your love letter has been preserved and shared.",
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
          <h2 className="text-xl font-light text-foreground">Love Letters</h2>
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
            <Lock className="w-3 h-3" />
            Private vault • Forever preserved
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-compose">
              <Pen className="w-4 h-4 mr-2" />
              Compose
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="font-light">Write a Love Letter</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Letter title (optional)"
                data-testid="input-letter-title"
              />
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Pour your heart out..."
                className="min-h-[300px] resize-none font-handwritten text-base"
                data-testid="input-letter-content"
              />
              <div className="flex gap-2 justify-end">
                <Button
                  variant="ghost"
                  onClick={() => setDialogOpen(false)}
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={!content.trim() || saving}
                  data-testid="button-save-letter"
                >
                  Save Letter
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <ScrollArea className="flex-1 p-6">
        {letters.length === 0 ? (
          <div className="max-w-md mx-auto text-center py-16 space-y-4">
            <div className="w-20 h-20 mx-auto rounded-full bg-accent/20 flex items-center justify-center">
              <Pen className="w-10 h-10 text-accent" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-light">No letters yet</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Write heartfelt letters to your beloved. These private messages are preserved
                forever in your encrypted vault.
              </p>
            </div>
            <Button
              className="mt-4"
              onClick={() => setDialogOpen(true)}
              data-testid="button-write-first"
            >
              <Pen className="w-4 h-4 mr-2" />
              Write Your First Letter
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 max-w-3xl mx-auto md:grid-cols-2">
            {letters.map((letter) => (
              <Card
                key={letter.id}
                className="p-6 hover-elevate cursor-pointer border-accent/20 bg-gradient-to-br from-cream/50 to-white"
                onClick={() => setSelectedLetter(letter)}
                data-testid={`letter-${letter.id}`}
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
                    <Heart className="w-4 h-4 text-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium truncate">{letter.title}</h3>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(letter.createdAt), 'MMM d, yyyy')}
                    </p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-3 font-handwritten">
                  {letter.content}
                </p>
              </Card>
            ))}
          </div>
        )}
      </ScrollArea>

      {selectedLetter && (
        <Dialog open={!!selectedLetter} onOpenChange={() => setSelectedLetter(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="font-light">{selectedLetter.title}</DialogTitle>
              <p className="text-xs text-muted-foreground">
                {format(new Date(selectedLetter.createdAt), 'MMMM d, yyyy')}
              </p>
            </DialogHeader>
            <ScrollArea className="max-h-[500px] mt-4">
              <div className="prose prose-sm max-w-none font-handwritten text-base leading-relaxed p-6 bg-cream/30 rounded-lg">
                {selectedLetter.content}
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
