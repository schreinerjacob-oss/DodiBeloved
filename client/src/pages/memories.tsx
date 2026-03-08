import { useState, useEffect, useRef } from 'react';
import { useDodi } from '@/contexts/DodiContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Camera, Lock, Calendar, Heart, X, ChevronUp, Trash2, Pencil, Plus, FileText, Bell } from 'lucide-react';
import { getMemories, getMemoriesCount, saveMemory, deleteMemory, getSetting, saveSetting, getAllCalendarEvents, saveCalendarEvent, getPartnerDetailsByUserId } from '@/lib/storage-encrypted';
import { usePeerConnection } from '@/hooks/use-peer-connection';
import { MemoryMediaImage } from '@/components/memory-media-image';
import { ImageFullscreenViewer } from '@/components/image-fullscreen-viewer';
import type { Memory, CalendarEvent, PartnerDetail } from '@/types';
import { format, isSameDay, subYears } from 'date-fns';
import { nanoid } from 'nanoid';
import { useToast } from '@/hooks/use-toast';
import { sendImageFromFile } from '@/lib/send-image';
import { saveMediaBlob } from '@/lib/storage';

const MEMORIES_PER_PAGE = 20;
const MAX_SPECIAL_DATES = 10;

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
  const memoriesRef = useRef<Memory[]>([]);
  memoriesRef.current = memories;

  // Our Story: special dates, notes, resurfaced
  const [specialDates, setSpecialDates] = useState<CalendarEvent[]>([]);
  const [anniversary, setAnniversary] = useState<CalendarEvent | null>(null);
  const [notesOnYou, setNotesOnYou] = useState<PartnerDetail[]>([]);
  const [resurfacedMemory, setResurfacedMemory] = useState<Memory | null>(null);
  const [resurfacedYearsAgo, setResurfacedYearsAgo] = useState<number | null>(null);
  const [addDateOpen, setAddDateOpen] = useState(false);
  const [addDateTitle, setAddDateTitle] = useState('');
  const [addDateValue, setAddDateValue] = useState('');
  const [addDateIsAnniversary, setAddDateIsAnniversary] = useState(false);
  const [savingDate, setSavingDate] = useState(false);
  const [remindEventIds, setRemindEventIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadMemories();
    loadSpecialDates();
    loadNotesOnYou();
    checkResurfaced();
    getSetting('dodi-remind-ids').then((raw) => {
      if (raw) setRemindEventIds(new Set(raw.split(',').filter(Boolean)));
    });
  }, []);

  // Remind me: check on visibility if any reminded date is today and not yet notified
  useEffect(() => {
    const checkReminders = async () => {
      if (remindEventIds.size === 0) return;
      const all = await getAllCalendarEvents();
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const notifiedKey = 'dodi-remind-notified-' + todayStr;
      const notified = (await getSetting(notifiedKey)) || '';
      const notifiedSet = new Set(notified.split(',').filter(Boolean));
      for (const ev of all) {
        if (!remindEventIds.has(ev.id)) continue;
        const evDateStr = format(new Date(ev.eventDate), 'yyyy-MM-dd');
        if (evDateStr !== todayStr) continue;
        if (notifiedSet.has(ev.id)) continue;
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          try {
            new Notification('Our Story', { body: `${ev.title} is today.`, icon: '/favicon.ico' });
            notifiedSet.add(ev.id);
            await saveSetting(notifiedKey, [...notifiedSet].join(','));
          } catch (_) {}
        }
      }
    };
    checkReminders();
    const onVis = () => checkReminders();
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [remindEventIds.size]);

  useEffect(() => {
    if (userId) loadNotesOnYou();
  }, [userId]);

  useEffect(() => {
    const handleCalendarSynced = () => loadSpecialDates();
    window.addEventListener('calendar-synced', handleCalendarSynced as EventListener);
    return () => window.removeEventListener('calendar-synced', handleCalendarSynced as EventListener);
  }, []);

  useEffect(() => {
    const handlePartnerDetailSynced = () => loadNotesOnYou();
    window.addEventListener('partner-detail-synced', handlePartnerDetailSynced as EventListener);
    return () => window.removeEventListener('partner-detail-synced', handlePartnerDetailSynced as EventListener);
  }, []);

  // Ensure Birthday calendar event exists when birthday is in settings
  useEffect(() => {
    if (!userId || !partnerId) return;
    let cancelled = false;
    (async () => {
      const birthdaySetting = await getSetting('birthday');
      if (!birthdaySetting || cancelled) return;
      const all = await getAllCalendarEvents();
      const birthdayId = `birthday-${userId}`;
      if (all.some(e => e.id === birthdayId)) return;
      const parts = birthdaySetting.split('-').map(Number);
      if (parts.length !== 3 || parts.some(Number.isNaN)) return;
      const [birthY, birthM, birthD] = parts;
      if (birthM < 1 || birthM > 12 || birthD < 1 || birthD > 31) return;
      const month = birthM - 1;
      const now = new Date();
      const clampDay = (y: number, m: number, d: number) => Math.min(d, new Date(y, m + 1, 0).getDate());
      const year1 = now.getFullYear();
      let eventDate = new Date(year1, month, clampDay(year1, month, birthD));
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (eventDate.getTime() < todayStart.getTime()) {
        eventDate = new Date(year1 + 1, month, clampDay(year1 + 1, month, birthD));
      }
      const moment: CalendarEvent = {
        id: birthdayId,
        userId,
        partnerId,
        title: 'Birthday',
        description: null,
        eventDate,
        isAnniversary: false,
        createdAt: new Date(),
      };
      await saveCalendarEvent(moment);
      if (!cancelled) {
        sendP2P({ type: 'calendar_event', data: moment, timestamp: Date.now() });
        loadSpecialDates();
      }
    })();
    return () => { cancelled = true; };
  }, [userId, partnerId]);

  const loadSpecialDates = async () => {
    const all = await getAllCalendarEvents();
    const anniv = all.find(e => e.isAnniversary) || null;
    setAnniversary(anniv);
    const others = all
      .filter(e => !e.isAnniversary && !e.id.startsWith('birthday-'))
      .sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime());
    setSpecialDates(others);
  };

  const loadNotesOnYou = async () => {
    if (!userId) return;
    const list = await getPartnerDetailsByUserId(userId);
    setNotesOnYou(list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
  };

  const checkResurfaced = async () => {
    const today = new Date();
    const dismissedAt = await getSetting('resurfacedDismissedAt');
    if (dismissedAt && isSameDay(new Date(Number(dismissedAt)), today)) return;
    const all = await getMemories(1000);
    for (const y of [1, 2, 3]) {
      const target = subYears(today, y);
      const match = all.find(m => isSameDay(new Date(m.timestamp), target));
      if (match) {
        setResurfacedMemory(match);
        setResurfacedYearsAgo(y);
        break;
      }
    }
  };

  const onResurfacedDismiss = () => {
    saveSetting('resurfacedDismissedAt', String(Date.now()));
    setResurfacedMemory(null);
    setResurfacedYearsAgo(null);
  };

  const handleSaveDate = async () => {
    if (!addDateTitle.trim() || !addDateValue || !userId || !partnerId) {
      toast({ title: 'Missing info', description: 'Please add a title and date', variant: 'destructive' });
      return;
    }
    const nonBirthdayCount = specialDates.filter(m => !m.id.startsWith('birthday-')).length;
    if (!addDateIsAnniversary && nonBirthdayCount >= MAX_SPECIAL_DATES) {
      toast({ title: 'Limit reached', description: `You can save up to ${MAX_SPECIAL_DATES} special dates`, variant: 'destructive' });
      return;
    }
    setSavingDate(true);
    try {
      const event: CalendarEvent = {
        id: nanoid(),
        userId,
        partnerId,
        title: addDateTitle.trim(),
        description: null,
        eventDate: new Date(addDateValue),
        isAnniversary: addDateIsAnniversary,
        createdAt: new Date(),
      };
      await saveCalendarEvent(event);
      sendP2P({ type: 'calendar_event', data: event, timestamp: Date.now() });
      setAddDateOpen(false);
      setAddDateTitle('');
      setAddDateValue('');
      setAddDateIsAnniversary(false);
      loadSpecialDates();
      toast({ title: 'Date saved', description: 'Added to Our Story.' });
    } catch (e) {
      toast({ title: 'Failed to save', variant: 'destructive' });
    } finally {
      setSavingDate(false);
    }
  };

  const handleDeleteDate = async (event: CalendarEvent) => {
    if (!window.confirm(`Remove "${event.title}"?`)) return;
    const { deleteCalendarEvent } = await import('@/lib/storage-encrypted');
    await deleteCalendarEvent(event.id);
    sendP2P({ type: 'calendar_event_delete', data: { id: event.id }, timestamp: Date.now() });
    loadSpecialDates();
    setRemindEventIds((prev) => {
      const next = new Set(prev);
      next.delete(event.id);
      getSetting('dodi-remind-ids').then((raw) => {
        const ids = (raw || '').split(',').filter((id) => id !== event.id);
        saveSetting('dodi-remind-ids', ids.join(','));
      });
      return next;
    });
    toast({ title: 'Date removed' });
  };

  const handleRemindToggle = async (eventId: string, checked: boolean) => {
    if (checked) {
      if (typeof Notification === 'undefined') {
        toast({ title: 'Notifications not supported', variant: 'destructive' });
        return;
      }
      if (Notification.permission === 'denied') {
        toast({ title: 'Notifications disabled', description: 'Enable in browser settings to get reminders.', variant: 'destructive' });
        return;
      }
      if (Notification.permission === 'default') {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') {
          toast({ title: 'Notifications disabled', description: 'Reminders need notification permission.', variant: 'destructive' });
          return;
        }
      }
    }
    setRemindEventIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(eventId);
      else next.delete(eventId);
      return next;
    });
    const raw = await getSetting('dodi-remind-ids');
    const ids = (raw || '').split(',').filter(Boolean);
    if (checked) {
      if (!ids.includes(eventId)) ids.push(eventId);
    } else {
      const i = ids.indexOf(eventId);
      if (i >= 0) ids.splice(i, 1);
    }
    await saveSetting('dodi-remind-ids', ids.join(','));
  };

  // Reload list when tab becomes visible so we reflect changes from another tab or after long background.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshNewestMemories();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
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

  // List order: oldest loaded at top, newest at bottom. This handler appends incoming
  // synced memories with duplicate check by id, then sorts by timestamp for robustness to out-of-order delivery.
  useEffect(() => {
    const handleMemorySynced = (event: CustomEvent) => {
      const incomingMemory = event.detail as Memory;
      setMemories(prev => {
        if (prev.some(m => m.id === incomingMemory.id)) {
          return prev;
        }
        const next = [...prev, incomingMemory].sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        return next;
      });
    };

    window.addEventListener('memory-synced', handleMemorySynced as EventListener);
    
    return () => {
      window.removeEventListener('memory-synced', handleMemorySynced as EventListener);
    };
  }, []);

  useEffect(() => {
    const handleMemoryDeleted = (event: CustomEvent<{ memoryId: string }>) => {
      const { memoryId } = event.detail || {};
      if (memoryId) setMemories(prev => prev.filter(m => m.id !== memoryId));
    };
    window.addEventListener('memory-deleted', handleMemoryDeleted as EventListener);
    return () => window.removeEventListener('memory-deleted', handleMemoryDeleted as EventListener);
  }, []);

  useEffect(() => {
    const handleMemoryUpdated = (event: CustomEvent<Memory>) => {
      const updated = event.detail;
      if (updated?.id) setMemories(prev => prev.map(m => (m.id === updated.id ? updated : m)));
    };
    window.addEventListener('memory-updated', handleMemoryUpdated as EventListener);
    return () => window.removeEventListener('memory-updated', handleMemoryUpdated as EventListener);
  }, []);

  const loadMemories = async () => {
    const mems = await getMemories(MEMORIES_PER_PAGE, 0);
    setMemories(mems);
    setMemoryOffset(0);
    setHasMoreMemories(mems.length === MEMORIES_PER_PAGE);
  };

  // Refresh only the newest page and merge with existing state. Preserves scroll position and
  // older memories already loaded. Caps memoryOffset by DB size so "Load more" never requests beyond the DB.
  const refreshNewestMemories = async () => {
    const [mems, totalCount] = await Promise.all([
      getMemories(MEMORIES_PER_PAGE, 0),
      getMemoriesCount(),
    ]);
    const prev = memoriesRef.current;
    const newestIds = new Set(mems.map(m => m.id));
    const olderLoaded = prev.filter(m => !newestIds.has(m.id));
    const merged = [...olderLoaded, ...mems].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    const offsetFromMerge = Math.max(0, merged.length - MEMORIES_PER_PAGE);
    const maxOffset = Math.max(0, totalCount - MEMORIES_PER_PAGE);
    setMemories(merged);
    setMemoryOffset(Math.min(offsetFromMerge, maxOffset));
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
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [confirmDeleteMemoryId, setConfirmDeleteMemoryId] = useState<string | null>(null);
  const [editingCaption, setEditingCaption] = useState('');

  const handleDeleteMemory = (memoryId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!userId || !partnerId) return;
    setConfirmDeleteMemoryId(memoryId);
  };

  const handleConfirmDeleteMemory = async () => {
    const memoryId = confirmDeleteMemoryId;
    if (!memoryId || !userId || !partnerId) return;
    setConfirmDeleteMemoryId(null);
    try {
      await deleteMemory(memoryId);
      setMemories(prev => prev.filter(m => m.id !== memoryId));
      sendP2P({
        type: 'memory-delete',
        data: { memoryId, userId, partnerId },
        timestamp: Date.now(),
      });
      toast({ title: 'Memory removed', description: 'It has been removed for both of you.' });
    } catch (err) {
      console.error('Delete memory error:', err);
      toast({ title: 'Failed to remove', description: 'Could not remove memory.', variant: 'destructive' });
    }
  };

  const handleEditCaption = (memory: Memory, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingMemoryId(memory.id);
    setEditingCaption(memory.caption ?? '');
  };

  const handleSaveCaption = async () => {
    if (!editingMemoryId || !userId || !partnerId) return;
    const memory = memories.find(m => m.id === editingMemoryId);
    if (!memory) return;
    const updated: Memory = { ...memory, caption: editingCaption.trim() || null };
    try {
      await saveMemory(updated);
      setMemories(prev => prev.map(m => (m.id === updated.id ? updated : m)));
      sendP2P({ type: 'memory-update', data: updated, timestamp: Date.now() });
      setEditingMemoryId(null);
      setEditingCaption('');
      toast({ title: 'Caption updated', description: 'Your partner will see the change.' });
    } catch (err) {
      console.error('Update caption error:', err);
      toast({ title: 'Failed to update caption', variant: 'destructive' });
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (preview) URL.revokeObjectURL(preview);
      setPreviewFile(file);
      setPreview(URL.createObjectURL(file));
    }
    e.target.value = '';
  };

  // Offline create: memory is saved locally; P2P payload and media are queued. On reconnect,
  // both flush so partner receives metadata then media and sees the memory.
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
        await sendImageFromFile(previewFile, { kind: 'memory', caption: caption.trim() }, {
          userId,
          partnerId,
          connected: peerState.connected,
          sendP2P,
          sendMedia,
          saveMediaBlob,
          getSetting,
          toast,
          saveMemory,
          onMemoryCreated: (m) => setMemories((prev) => [...prev, m]),
        });
      }

      if (preview) URL.revokeObjectURL(preview);
      setCaption('');
      setPreview('');
      setPreviewFile(null);
      setDialogOpen(false);
      if (isVideo) {
        toast({
          title: 'Memory saved 🎬',
          description: 'Your precious moment is preserved and shared.',
        });
      }
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
    <div className="flex-1 min-h-0 flex flex-col bg-background">
      <div className="flex-shrink-0 h-14 flex items-center justify-between px-4 border-b border-gold/20 bg-card/60 wood-grain">
        <h2 className="text-base font-heading font-semibold text-foreground">Our Story</h2>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" data-testid="button-add-memory">
              <Camera className="w-4 h-4 mr-1.5" />
              Add
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

      <ScrollArea className="flex-1 min-h-0 p-6">
        <div className="max-w-2xl mx-auto space-y-10 pb-6">
          {/* Resurfaced: 1 match per day, dismiss hides for day */}
          {resurfacedMemory && resurfacedYearsAgo !== null && (
            <section>
              <h3 className="text-sm font-medium text-stone dark:text-muted-foreground mb-2">
                On this day, {resurfacedYearsAgo} {resurfacedYearsAgo === 1 ? 'year' : 'years'} ago
              </h3>
              <Card className="p-4 bg-walnut border-walnut-light overflow-hidden">
                <div className="flex gap-4">
                  <div className="w-24 h-24 rounded-lg overflow-hidden flex-shrink-0 bg-walnut-light/80 border border-white/10">
                    <MemoryMediaImage memoryId={resurfacedMemory.id} mediaType={resurfacedMemory.mediaType} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm italic text-white/95">{resurfacedMemory.caption || 'A beautiful moment...'}</p>
                    <p className="text-xs text-white/70 mt-1">{format(resurfacedMemory.timestamp, 'MMMM d, yyyy')}</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="mt-2 text-white/90 hover:bg-white/10" onClick={onResurfacedDismiss}>Later</Button>
              </Card>
            </section>
          )}

          {/* Special dates */}
          <section>
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Special dates</h3>
            {anniversary && (
              <Card className="p-3 mb-2 border-copper/30 bg-copper/10">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Heart className="w-4 h-4 text-copper shrink-0" />
                    <span className="font-medium truncate">{anniversary.title}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs px-2 py-0.5 rounded bg-copper/20 text-copper font-medium">{format(new Date(anniversary.eventDate), 'MMM d')}</span>
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Bell className="w-3.5 h-3.5" />
                      <Switch
                        checked={remindEventIds.has(anniversary.id)}
                        onCheckedChange={(c) => handleRemindToggle(anniversary.id, c)}
                        className="data-[state=checked]:bg-sage"
                      />
                    </label>
                  </div>
                </div>
              </Card>
            )}
            {specialDates.map(ev => (
              <Card key={ev.id} className="p-3 mb-2 flex items-center justify-between gap-2">
                <span className="text-sm truncate min-w-0">{ev.title}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground">{format(new Date(ev.eventDate), 'MMM d')}</span>
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Bell className="w-3.5 h-3.5" />
                    <Switch
                      checked={remindEventIds.has(ev.id)}
                      onCheckedChange={(c) => handleRemindToggle(ev.id, c)}
                      className="data-[state=checked]:bg-sage"
                    />
                  </label>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDeleteDate(ev)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </Card>
            ))}
            <Button variant="outline" size="sm" onClick={() => setAddDateOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add date
            </Button>
          </section>

          {/* Notes on You */}
          <section>
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Notes on you</h3>
            <p className="text-xs text-muted-foreground mb-2">One-tap save from chat reactions. Private, just for you.</p>
            {notesOnYou.map(n => (
              <Card key={n.id} className="p-3 mb-2">
                <p className="text-sm text-foreground">{n.content}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{format(n.createdAt, 'MMM d, yyyy')}</p>
              </Card>
            ))}
            {notesOnYou.length === 0 && (
              <p className="text-sm text-muted-foreground italic">Long-press a message in Chat → Save as note</p>
            )}
          </section>

          {/* Our memories grid */}
          <section>
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Our memories</h3>
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
                className="group relative overflow-hidden aspect-square border border-walnut/30 dark:border-walnut hover-elevate cursor-pointer"
                data-testid={`memory-${memory.id}`}
                onClick={() => {
                  setFullscreenMemoryId(memory.id);
                  setFullscreenMediaType(memory.mediaType);
                }}
              >
                <div className="absolute top-2 right-2 z-10 flex gap-1 opacity-0 group-hover:opacity-100">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 bg-black/50 hover:bg-black/70 text-white"
                    onClick={(e) => handleEditCaption(memory, e)}
                    data-testid={`button-edit-memory-${memory.id}`}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 bg-black/50 hover:bg-black/70 text-white"
                    onClick={(e) => handleDeleteMemory(memory.id, e)}
                    data-testid={`button-delete-memory-${memory.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
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
          </section>
        </div>
      </ScrollArea>

      <Dialog open={addDateOpen} onOpenChange={setAddDateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-light">Add special date</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label className="text-xs text-muted-foreground">Title</Label>
              <Input
                value={addDateTitle}
                onChange={e => setAddDateTitle(e.target.value)}
                placeholder="e.g. First date"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Date</Label>
              <Input
                type="date"
                value={addDateValue}
                onChange={e => setAddDateValue(e.target.value)}
                className="mt-1"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={addDateIsAnniversary}
                onChange={e => setAddDateIsAnniversary(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm">Anniversary</span>
            </label>
            <Button onClick={handleSaveDate} disabled={savingDate || !addDateTitle.trim() || !addDateValue} className="w-full">
              {savingDate ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editingMemoryId !== null} onOpenChange={(open) => { if (!open) { setEditingMemoryId(null); setEditingCaption(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-light">Edit caption</DialogTitle>
          </DialogHeader>
          <Input
            value={editingCaption}
            onChange={(e) => setEditingCaption(e.target.value)}
            placeholder="Caption (optional)"
            data-testid="input-edit-caption"
            className="mt-2"
          />
          <div className="flex gap-2 justify-end mt-4">
            <Button variant="outline" onClick={() => { setEditingMemoryId(null); setEditingCaption(''); }}>Cancel</Button>
            <Button onClick={handleSaveCaption} data-testid="button-save-caption">Save</Button>
          </div>
        </DialogContent>
      </Dialog>

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

      <AlertDialog open={confirmDeleteMemoryId !== null} onOpenChange={(open) => { if (!open) setConfirmDeleteMemoryId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this memory?</AlertDialogTitle>
            <AlertDialogDescription>
              This memory will be removed for both of you. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDeleteMemory} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
