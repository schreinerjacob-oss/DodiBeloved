import { useState, useEffect, useRef } from 'react';
import { useDodi } from '@/contexts/DodiContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Camera, Lock, Calendar, Heart, X } from 'lucide-react';
import { getAllMemories, saveMemory } from '@/lib/storage-encrypted';
import { usePeerConnection } from '@/hooks/use-peer-connection';
import type { Memory, SyncMessage } from '@/types';
import { format } from 'date-fns';
import { nanoid } from 'nanoid';
import { useToast } from '@/hooks/use-toast';

export default function MemoriesPage() {
  const { userId, partnerId } = useDodi();
  const { toast } = useToast();
  const { send: sendP2P, state: peerState } = usePeerConnection();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [caption, setCaption] = useState<string>('');
  const [preview, setPreview] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadMemories();
  }, []);

  // Listen for incoming memories from partner via P2P
  useEffect(() => {
    if (!peerState.connected || !partnerId) return;

    const handleP2pMessage = async (event: CustomEvent) => {
      try {
        const message: SyncMessage = event.detail;
        
        if (message.type === 'memory') {
          const incomingMemory = message.data as Memory;
          const isOurMemory = (incomingMemory.userId === userId && incomingMemory.partnerId === partnerId) ||
                             (incomingMemory.userId === partnerId && incomingMemory.partnerId === userId);
          
          if (isOurMemory) {
            await saveMemory(incomingMemory);
            setMemories(prev => {
              if (prev.some(m => m.id === incomingMemory.id)) {
                return prev;
              }
              return [...prev, incomingMemory];
            });
          }
        }
      } catch (e) {
        console.error('🔗 [P2P] Error handling memory message:', e);
      }
    };

    window.addEventListener('p2p-message', handleP2pMessage as EventListener);
    
    return () => {
      window.removeEventListener('p2p-message', handleP2pMessage as EventListener);
    };
  }, [peerState.connected, partnerId, userId];

  const loadMemories = async () => {
    const allMemories = await getAllMemories();
    setMemories(allMemories);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setPreview(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveMemory = async () => {
    if (!preview || !userId || !partnerId) return;
    setSaving(true);
    try {
      const memory: Memory = {
        id: nanoid(),
        userId,
        partnerId,
        imageData: preview,
        mediaUrl: preview,
        caption: caption.trim() || null,
        mediaType: 'photo',
        timestamp: new Date(),
        createdAt: new Date(),
      };
      
      // Save to local IndexedDB first
      await saveMemory(memory);
      
      // Add to local state immediately
      setMemories(prev => [...prev, memory]);
      
      // Send to partner via WebSocket
      sendWS({
        type: 'memory',
        data: memory,
      });
      
      setCaption('');
      setPreview('');
      setDialogOpen(false);
      toast({
        title: "Memory saved 📸",
        description: "Your precious moment is preserved and shared.",
      });
    } catch (error) {
      console.error('Save memory error:', error);
      toast({
        title: "Failed to save",
        description: "Could not save memory. Please try again.",
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
          <h2 className="text-xl font-light text-foreground">Our Memories</h2>
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
            <Lock className="w-3 h-3" />
            Private vault • Never in gallery
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-memory">
              <Camera className="w-4 h-4 mr-2" />
              Add Memory
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="font-light">Capture a Memory</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="border-2 border-dashed border-sage/30 rounded-lg p-6 text-center hover-elevate cursor-pointer"
                onClick={() => fileInputRef.current?.click()}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  onChange={handleFileSelect}
                  className="hidden"
                  data-testid="input-memory-file"
                />
                {preview ? (
                  <div className="relative">
                    <img src={preview} alt="Preview" className="max-h-64 mx-auto rounded-lg" />
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={(e) => { e.stopPropagation(); setPreview(''); }}
                      className="absolute top-2 right-2"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Camera className="w-12 h-12 mx-auto text-sage/50" />
                    <p className="text-sm text-muted-foreground">Click to select a photo or video</p>
                  </div>
                )}
              </div>
              <Input
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Add a caption (optional)"
                data-testid="input-memory-caption"
              />
              <Button
                onClick={handleSaveMemory}
                disabled={!preview || saving}
                className="w-full"
                data-testid="button-save-memory"
              >
                {saving ? 'Saving...' : 'Save Memory'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <ScrollArea className="flex-1 p-6">
        {memories.length === 0 ? (
          <div className="max-w-md mx-auto text-center py-16 space-y-4">
            <div className="w-20 h-20 mx-auto rounded-full bg-accent/20 flex items-center justify-center">
              <Camera className="w-10 h-10 text-accent" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-light">No memories yet</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Capture and preserve your precious moments together in this private, encrypted vault.
                Photos and videos here never touch your device gallery.
              </p>
            </div>
            <Button className="mt-4" data-testid="button-create-first-memory">
              <Camera className="w-4 h-4 mr-2" />
              Create Your First Memory
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-w-6xl mx-auto">
            {memories.map((memory) => (
              <Card
                key={memory.id}
                className="group relative overflow-hidden aspect-square border-sage/30 hover-elevate cursor-pointer"
                data-testid={`memory-${memory.id}`}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-sage/20 to-blush/20" />
                <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/60 to-transparent">
                  <div className="flex items-center gap-1 text-white text-xs">
                    <Calendar className="w-3 h-3" />
                    {format(new Date(memory.timestamp), 'MMM d, yyyy')}
                  </div>
                  {memory.caption && (
                    <p className="text-white text-xs mt-1 line-clamp-2">{memory.caption}</p>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
