import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Sparkles, X, Heart } from 'lucide-react';
import { getMemories } from '@/lib/storage-encrypted';
import { format, isSameDay, subYears } from 'date-fns';
import type { Memory } from '@/types';
import { MessageMediaImage } from '@/components/message-media-image';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export function MemoryResurfacing() {
  const [memory, setMemory] = useState<Memory | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [yearsAgo, setYearsAgo] = useState(1);

  useEffect(() => {
    async function checkForMemory() {
      // Check for 1, 2, or 3 years ago
      const today = new Date();
      const allMemories = await getMemories(1000); // Get all to search for dates
      
      for (let y = 1; y <= 3; y++) {
        const targetDate = subYears(today, y);
        const match = allMemories.find(m => isSameDay(new Date(m.timestamp), targetDate));
        
        if (match) {
          setMemory(match);
          setYearsAgo(y);
          // 20% chance to show it (1-2 times per week on average if checked daily)
          // For testing purposes, we'll show it if it exists
          setIsVisible(true);
          break;
        }
      }
    }
    
    checkForMemory();
  }, []);

  if (!memory || !isVisible) return null;

  return (
    <div className="fixed bottom-24 left-4 right-4 z-50 animate-soft-fade-in pointer-events-auto">
      <Card className="p-4 bg-gradient-to-br from-sage/20 via-background to-blush/20 border-accent/30 shadow-xl overflow-hidden relative">
        <Button 
          variant="ghost" 
          size="icon" 
          className="absolute top-2 right-2 h-8 w-8 rounded-full bg-background/50 backdrop-blur-sm"
          onClick={() => setIsVisible(false)}
        >
          <X className="w-4 h-4" />
        </Button>

        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-accent animate-pulse" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-accent">
            {yearsAgo} {yearsAgo === 1 ? 'year' : 'years'} ago today...
          </span>
        </div>

        <div className="flex gap-4 items-start">
          <div className="w-24 h-24 rounded-lg overflow-hidden bg-muted flex-shrink-0 border">
            <MessageMediaImage messageId={memory.id} fileName={memory.caption || 'memory'} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-handwritten italic line-clamp-3 mb-2">
              "{memory.caption || 'A beautiful shared moment...'}"
            </p>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Heart className="w-3 h-3 text-accent fill-accent" />
              <span>{format(new Date(memory.timestamp), 'MMMM d, yyyy')}</span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
