import { useState, useEffect } from 'react';
import { useDodi } from '@/contexts/DodiContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Lock } from 'lucide-react';
import { getPartnerDetailsByUserId, savePartnerDetail } from '@/lib/storage-encrypted';
import { usePeerConnection } from '@/hooks/use-peer-connection';
import type { PartnerDetail, PartnerDetailTag } from '@/types';
import { nanoid } from 'nanoid';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

const TAGS: { value: PartnerDetailTag; label: string }[] = [
  { value: 'remember', label: 'Remember' },
  { value: 'important', label: 'Important' },
  { value: 'follow-up', label: 'Follow-up' },
  { value: 'funny', label: 'Funny' },
  { value: 'sweet', label: 'Sweet' },
  { value: 'to celebrate', label: 'To celebrate' },
  { value: 'to avoid', label: 'To avoid' },
];

export function SavedPartnerDetailsTab() {
  const { userId, partnerId } = useDodi();
  const { toast } = useToast();
  const { send: sendP2P } = usePeerConnection();
  const [details, setDetails] = useState<PartnerDetail[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [content, setContent] = useState('');
  const [tag, setTag] = useState<PartnerDetailTag>('remember');

  useEffect(() => {
    if (userId) loadDetails();
  }, [userId]);

  const loadDetails = async () => {
    if (!userId) return;
    const list = await getPartnerDetailsByUserId(userId);
    setDetails(list);
  };

  const handleSave = async () => {
    if (!content.trim() || !userId) return;
    const detail: PartnerDetail = {
      id: nanoid(),
      userId,
      partnerId: partnerId ?? undefined,
      content: content.trim(),
      tag,
      createdAt: new Date(),
    };
    await savePartnerDetail(detail);
    setDetails(prev => [detail, ...prev]);
    setContent('');
    setTag('remember');
    setDialogOpen(false);
    if (partnerId) {
      sendP2P({ type: 'partner_detail', data: detail, timestamp: Date.now() });
    }
    toast({ title: 'Saved', description: 'Detail saved to your private list.' });
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Private notes about your partner — only you see these. Synced for recovery.
      </p>
      <div className="flex items-center gap-2">
        <Lock className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">100% private to you</span>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <Button size="sm" data-testid="button-add-detail">
            <Plus className="w-4 h-4 mr-1" />
            Add
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-light">Add partner detail</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <Input
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Note about your partner..."
              className="min-h-[80px]"
              data-testid="input-detail-content"
            />
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Tag</label>
              <Select value={tag} onValueChange={(v) => setTag(v as PartnerDetailTag)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TAGS.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleSave} disabled={!content.trim()} className="w-full" data-testid="button-save-detail">
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {details.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground">
          <p className="text-sm">No details yet. Add a note to remember something about your partner.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {details.map(d => (
            <Card key={d.id} className="p-4">
              <p className="text-sm text-foreground">{d.content}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                  {TAGS.find(t => t.value === d.tag)?.label ?? d.tag}
                </span>
                <span className="text-xs text-muted-foreground">{format(new Date(d.createdAt), 'MMM d, yyyy')}</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
