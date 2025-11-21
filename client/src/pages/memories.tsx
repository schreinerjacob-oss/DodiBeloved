import { useState, useEffect } from 'react';
import { useDodi } from '@/contexts/DodiContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Camera, Lock, Calendar, Heart } from 'lucide-react';
import { getAllMemories } from '@/lib/storage';
import type { Memory } from '@shared/schema';
import { format } from 'date-fns';

export default function MemoriesPage() {
  const { userId, partnerId } = useDodi();
  const [memories, setMemories] = useState<Memory[]>([]);

  useEffect(() => {
    loadMemories();
  }, []);

  const loadMemories = async () => {
    const allMemories = await getAllMemories();
    setMemories(allMemories);
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

        <Button data-testid="button-add-memory">
          <Camera className="w-4 h-4 mr-2" />
          Add Memory
        </Button>
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
