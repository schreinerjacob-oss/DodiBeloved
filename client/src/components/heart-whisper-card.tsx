import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Heart, FileText, X } from 'lucide-react';
import { getStartOfWeek, type HeartWhisperPrompt } from '@/lib/heart-whispers';
import { getSetting, saveSetting, savePartnerDetail } from '@/lib/storage-encrypted';
import { useDodi } from '@/contexts/DodiContext';
import { useToast } from '@/hooks/use-toast';
import { usePeerConnection } from '@/hooks/use-peer-connection';
import { nanoid } from 'nanoid';
import type { PartnerDetail } from '@/types';

interface HeartWhisperCardProps {
  whisper: HeartWhisperPrompt;
  onDismiss: () => void;
  onSavedOrDismissed: () => void;
}

export function HeartWhisperCard({ whisper, onDismiss, onSavedOrDismissed }: HeartWhisperCardProps) {
  const { userId, partnerId } = useDodi();
  const { toast } = useToast();
  const { send: sendP2P } = usePeerConnection();

  const handleDismiss = () => {
    const weekStart = getStartOfWeek(new Date());
    getSetting('dismissedWhisperIds')
      .then((raw) => {
        const current = (raw || '').split(',').filter(Boolean);
        if (!current.includes(whisper.id)) current.push(whisper.id);
        return Promise.all([
          saveSetting('dismissedWhisperIds', current.join(',')),
          saveSetting('dismissedWhisperIdsWeekStart', String(weekStart.getTime())),
        ]);
      })
      .then(() => {
        onDismiss();
        onSavedOrDismissed();
      })
      .catch(() => {
        toast({ title: 'Could not save dismissal', variant: 'destructive' });
        // Do not call onDismiss/onSavedOrDismissed so the card stays visible when persistence fails
      });
  };

  const handleSaveToNotes = async () => {
    if (!userId || !partnerId) return;
    const detail: PartnerDetail = {
      id: nanoid(),
      userId,
      partnerId,
      content: whisper.text,
      tag: 'remember',
      createdAt: new Date(),
    };
    try {
      await savePartnerDetail(detail);
      const syncNotes = await getSetting('syncPrivateNotes');
      if (syncNotes !== 'false') sendP2P({ type: 'partner_detail', data: detail, timestamp: Date.now() });
      // Mark whisper as dismissed so it won't show again this week (same as "Later")
      const weekStart = getStartOfWeek(new Date());
      const raw = await getSetting('dismissedWhisperIds');
      const current = (raw || '').split(',').filter(Boolean);
      if (!current.includes(whisper.id)) current.push(whisper.id);
      await Promise.all([
        saveSetting('dismissedWhisperIds', current.join(',')),
        saveSetting('dismissedWhisperIdsWeekStart', String(weekStart.getTime())),
      ]);
      toast({ title: 'Saved to Our Story', description: 'Added to Notes on you.' });
      onDismiss();
      onSavedOrDismissed();
    } catch (e) {
      toast({ title: 'Could not save', variant: 'destructive' });
      // Do not call onDismiss/onSavedOrDismissed so the card stays visible for retry
    }
  };

  return (
    <Card className="p-4 border-sage/30 bg-gradient-to-br from-sage/10 to-blush/10 paper-grain overflow-hidden">
      <div className="flex items-start gap-2">
        <Heart className="w-4 h-4 text-accent fill-accent shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-handwritten italic text-foreground">{whisper.text}</p>
          <div className="flex gap-2 mt-3">
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={handleSaveToNotes}>
              <FileText className="w-3.5 h-3.5 mr-1.5" />
              Save to Notes
            </Button>
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={handleDismiss}>
              <X className="w-3.5 h-3.5 mr-1.5" />
              Later
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
