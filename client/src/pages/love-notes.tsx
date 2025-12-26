import { useState, useEffect } from 'react';
import { useDodi } from '@/contexts/DodiContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Pen, Lock, Heart, Plus, ArrowLeft } from 'lucide-react';
import { getAllLoveLetters, saveLoveLetter } from '@/lib/storage-encrypted';
import { usePeerConnection } from '@/hooks/use-peer-connection';
import type { LoveLetter } from '@/types';
import { nanoid } from 'nanoid';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { useLocation } from 'wouter';

export default function LoveNotesPage() {
  const { userId, partnerId } = useDodi();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { send: sendP2P, state: peerState } = usePeerConnection();
  const [notes, setNotes] = useState<LoveLetter[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedNote, setSelectedNote] = useState<LoveLetter | null>(null);

  useEffect(() => {
    loadNotes();
  }, []);

  useEffect(() => {
    const handleLetterSynced = (event: CustomEvent) => {
      const incoming = event.detail as LoveLetter;
      setNotes(prev => {
        if (prev.some(n => n.id === incoming.id)) return prev;
        return [incoming, ...prev];
      });
    };
    window.addEventListener('letter-synced', handleLetterSynced as EventListener);
    return () => window.removeEventListener('letter-synced', handleLetterSynced as EventListener);
  }, []);

  const loadNotes = async () => {
    const all = await getAllLoveLetters();
    const sorted = all.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    setNotes(sorted);
  };

  const handleSave = async () => {
    if (!content.trim() || !userId || !partnerId) return;

    setSaving(true);
    try {
      const note: LoveLetter = {
        id: nanoid(),
        authorId: userId,
        recipientId: partnerId,
        title: title.trim() || 'A note for you',
        content,
        createdAt: new Date(),
      };

      await saveLoveLetter(note);
      setNotes(prev => [note, ...prev]);
      
      sendP2P({
        type: 'love_letter',
        data: note,
        timestamp: Date.now(),
      });

      setTitle('');
      setContent('');
      setDialogOpen(false);

      toast({
        title: "Note saved",
        description: "Your love note has been sent",
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

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="flex items-center justify-between px-6 py-4 border-b bg-card/50">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation('/moments')}
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="text-xl font-light text-foreground">Love Notes</h2>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <Lock className="w-3 h-3" />
              Private vault
            </p>
          </div>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" data-testid="button-compose">
              <Pen className="w-4 h-4 mr-1" />
              Write
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-light">Write a Love Note</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title (optional)"
                data-testid="input-note-title"
              />
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Pour your heart out..."
                className="min-h-[200px] resize-none font-handwritten text-base"
                data-testid="input-note-content"
              />
              <div className="flex gap-2 justify-end">
                <Button
                  variant="ghost"
                  onClick={() => setDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={!content.trim() || saving}
                  data-testid="button-save-note"
                >
                  Save Note
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <ScrollArea className="flex-1 p-6">
        {notes.length === 0 ? (
          <div className="max-w-sm mx-auto text-center py-12 space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-accent/20 flex items-center justify-center">
              <Pen className="w-8 h-8 text-accent" />
            </div>
            <div className="space-y-2">
              <h3 className="font-medium">No notes yet</h3>
              <p className="text-sm text-muted-foreground">
                Write heartfelt notes preserved forever in your encrypted vault.
              </p>
            </div>
            <Button onClick={() => setDialogOpen(true)} data-testid="button-write-first">
              <Pen className="w-4 h-4 mr-2" />
              Write Your First Note
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 max-w-2xl mx-auto">
            {notes.map((note) => {
              const isFromPartner = note.authorId === partnerId;
              return (
                <Card
                  key={note.id}
                  className="p-5 hover-elevate cursor-pointer bg-gradient-to-br from-cream/50 to-white border-accent/20"
                  onClick={() => setSelectedNote(note)}
                  data-testid={`note-${note.id}`}
                >
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
                      <Heart className="w-4 h-4 text-accent" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-medium truncate">{note.title}</h3>
                        {isFromPartner && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent">
                            From beloved
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(note.createdAt), 'MMM d, yyyy')}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2 font-handwritten">
                    {note.content}
                  </p>
                </Card>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {selectedNote && (
        <Dialog open={!!selectedNote} onOpenChange={() => setSelectedNote(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-light">{selectedNote.title}</DialogTitle>
              <p className="text-xs text-muted-foreground">
                {format(new Date(selectedNote.createdAt), 'MMMM d, yyyy')}
              </p>
            </DialogHeader>
            <ScrollArea className="max-h-[400px] mt-4">
              <div className="prose prose-sm max-w-none font-handwritten text-base leading-relaxed p-4 bg-cream/30 rounded-lg whitespace-pre-wrap">
                {selectedNote.content}
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
