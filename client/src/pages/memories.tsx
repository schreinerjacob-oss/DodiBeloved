import { useState, useEffect, useRef } from 'react';
import { useDodi } from '@/contexts/DodiContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Camera, Lock, Calendar, Heart, X, ChevronUp } from 'lucide-react';
import { getMemories, saveMemory } from '@/lib/storage-encrypted';
import { usePeerConnection } from '@/hooks/use-peer-connection';
import { MemoryMediaImage } from '@/components/memory-media-image';
import { ImageFullscreenViewer } from '@/components/image-fullscreen-viewer';
import type { Memory } from '@/types';
import { format } from 'date-fns';
import { nanoid } from 'nanoid';
import { useToast } from '@/hooks/use-toast';
import { compressImage, compressImageWithPreset } from '@/lib/utils';

const MEMORIES_PER_PAGE = 20;

export default function MemoriesPage() {
  const { userId, partnerId } = useDodi();
  const { toast } = useToast();
  const { send: sendP2P, sendMedia, state: peerState } = usePeerConnection();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [caption, setCaption] = useState<string>('');
  const [preview, setPreview] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [fullscreenMemoryId, setFullscreenMemoryId] = useState<string | null>(null);
  const [fullscreenMediaType, setFullscreenMediaType] = useState<Memory['mediaType'] | undefined>(undefined);
  const [memoryOffset, setMemoryOffset] = useState(0);
  const [hasMoreMemories, setHasMoreMemories] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadMemories();
  }, []);

  // Clear dialog form state when dialog closes so reopening starts fresh
  useEffect(() => {
    if (!dialogOpen) {
      if (preview) URL.revokeObjectURL(preview);
      setCaption('');
      setPreview('');
      setPreviewFile(null);
    }
  }, [dialogOpen]);

  // Listen for memories synced by the global sync handler
  useEffect(() => {
    const handleMemorySynced = (event: CustomEvent) => {
      const incomingMemory = event.detail as Memory;
      setMemories(prev => {
        if (prev.some(m => m.id === incomingMemory.id)) {
          return prev;
        }
        return [...prev, incomingMemory];
      });
    };

    window.addEventListener('memory-synced', handleMemorySynced as EventListener);
    
    return () => {
      window.removeEventListener('memory-synced', handleMemorySynced as EventListener);
    };
  }, []);

  const loadMemories = async () => {
    const mems = await getMemories(MEMORIES_PER_PAGE, 0);
    setMemories(mems);
    setMemoryOffset(0);
    setHasMoreMemories(mems.length === MEMORIES_PER_PAGE);
  };

  const loadMoreMemories = async () => {
    setLoadingMore(true);
    const newOffset = memoryOffset + MEMORIES_PER_PAGE;
    const mems = await getMemories(MEMORIES_PER_PAGE, newOffset);
    setMemories(prev => [...mems, ...prev]);
    setMemoryOffset(newOffset);
    setHasMoreMemories(mems.length === MEMORIES_PER_PAGE);
    setLoadingMore(false);
  };

  const [previewFile, setPreviewFile] = useState<File | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (preview) URL.revokeObjectURL(preview);
      setPreviewFile(file);
      setPreview(URL.createObjectURL(file));
    }
    e.target.value = '';
  };

  const handleSaveMemory = async () => {
    if (!previewFile || !userId || !partnerId) return;
    const isVideo = previewFile.type.startsWith('video/');
    const MAX_VIDEO_MB = 100;
    if (isVideo && previewFile.size > MAX_VIDEO_MB * 1024 * 1024) {
      toast({
        title: 'Video too large',
        description: `Please choose a video under ${MAX_VIDEO_MB}MB.`,
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    try {
      const memoryId = nanoid();
      const isOffline = !peerState.connected;
      const { saveMediaBlob } = await import('@/lib/storage');
      const { getSetting } = await import('@/lib/storage-encrypted');

      if (isVideo) {
        await saveMediaBlob(memoryId, previewFile, 'memory', 'preview');
        const memory: Memory = {
          id: memoryId,
          userId,
          partnerId,
          imageData: '',
          mediaUrl: null,
          caption: caption.trim() || null,
          mediaType: 'video',
          timestamp: new Date(),
          createdAt: new Date(),
        };
        await saveMemory(memory);
        setMemories(prev => [...prev, memory]);
        sendP2P({
          type: 'memory',
          data: { ...memory, mediaUrl: null, imageData: '' },
          timestamp: Date.now(),
        });
        await sendMedia({ mediaId: memoryId, kind: 'memory', mime: previewFile.type || 'video/mp4' });
      } else {
        const imageSendMode = (await getSetting('imageSendMode')) || 'balanced';
        const previewPreset = imageSendMode === 'aggressive' ? 'aggressive' : 'balanced';
        const compressedBlob = await compressImageWithPreset(previewFile, previewPreset);
        await saveMediaBlob(memoryId, compressedBlob, 'memory', 'preview');
        const memory: Memory = {
          id: memoryId,
          userId,
          partnerId,
          imageData: '',
          mediaUrl: null,
          caption: caption.trim() || null,
          mediaType: 'photo',
          timestamp: new Date(),
          createdAt: new Date(),
        };
        await saveMemory(memory);
        setMemories(prev => [...prev, memory]);
        sendP2P({
          type: 'memory',
          data: { ...memory, mediaUrl: null, imageData: '' },
          timestamp: Date.now(),
        });
        await sendMedia({ mediaId: memoryId, kind: 'memory', mime: compressedBlob.type || previewFile.type || 'image/jpeg' });
        if ((imageSendMode === 'balanced' || imageSendMode === 'full') && previewFile.size !== compressedBlob.size) {
          const trySendFull = async () => {
            try {
              await saveMediaBlob(memoryId, previewFile, 'memory', 'full');
              await sendMedia({ mediaId: memoryId, kind: 'memory', mime: previewFile.type || 'image/jpeg', variant: 'full', blob: previewFile });
            } catch {
              const fallback = await compressImage(previewFile, 960, 0.5);
              await saveMediaBlob(memoryId, fallback, 'memory', 'full');
              await sendMedia({ mediaId: memoryId, kind: 'memory', mime: 'image/jpeg', variant: 'full', blob: fallback });
            }
          };
          void trySendFull().catch((err) => {
            console.warn('🖼️ [MEDIA] Full-quality send failed, will retry when online:', err);
            toast({ title: 'Full-quality sync delayed', description: 'Will send when connection is stable.', variant: 'default' });
          });
        }
      }

      if (preview) URL.revokeObjectURL(preview);
      setCaption('');
      setPreview('');
      setPreviewFile(null);
      setDialogOpen(false);
      toast({
        title: isVideo ? 'Memory saved 🎬' : 'Memory saved 📸',
        description: 'Your precious moment is preserved and shared.',
      });
    } catch (error) {
      console.error('Save memory error:', error);
      toast({
        title: 'Failed to save',
        description: 'Could not save memory. Please try again.',
        variant: 'destructive',
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
                    {previewFile?.type?.startsWith('video/') ? (
                      <video src={preview} controls className="max-h-64 mx-auto rounded-lg w-full object-contain" />
                    ) : (
                      <img src={preview} alt="Preview" className="max-h-64 mx-auto rounded-lg" />
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={(e) => { e.stopPropagation(); if (preview) URL.revokeObjectURL(preview); setPreview(''); setPreviewFile(null); }}
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
          <div className="space-y-6 max-w-6xl mx-auto">
            {hasMoreMemories && memories.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={loadMoreMemories}
                disabled={loadingMore}
                className="w-full"
                data-testid="button-load-more-memories"
              >
                <ChevronUp className="w-4 h-4 mr-2" />
                {loadingMore ? 'Loading...' : 'Load Earlier Memories'}
              </Button>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {memories.map((memory) => (
              <Card
                key={memory.id}
                className="group relative overflow-hidden aspect-square border-sage/30 hover-elevate cursor-pointer"
                data-testid={`memory-${memory.id}`}
                onClick={() => {
                  setFullscreenMemoryId(memory.id);
                  setFullscreenMediaType(memory.mediaType);
                }}
              >
                <MemoryMediaImage memoryId={memory.id} mediaType={memory.mediaType} />
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
          </div>
        )}
      </ScrollArea>

      {fullscreenMemoryId && (
        <ImageFullscreenViewer
          mediaId={fullscreenMemoryId}
          kind="memory"
          alt="Memory"
          mediaType={fullscreenMediaType}
          onClose={() => {
            setFullscreenMemoryId(null);
            setFullscreenMediaType(undefined);
          }}
        />
      )}
    </div>
  );
}
