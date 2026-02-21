import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useDodi } from '@/contexts/DodiContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Toggle } from '@/components/ui/toggle';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Heart, Send, Image, Mic, MicOff, Eye, EyeOff, ChevronUp, Check, CheckCheck, Loader2, Smile, ThumbsUp, Star, Clock, CloudOff, Filter, Video, VideoOff, Circle, Square, Plus, FileText } from 'lucide-react';
import { getMessages, saveMessage, deleteMessage, savePartnerDetail } from '@/lib/storage-encrypted';
import { usePeerConnection } from '@/hooks/use-peer-connection';
import { useOfflineQueueSize } from '@/hooks/use-offline-queue';
import { MessageMediaImage } from '@/components/message-media-image';
import { ImageFullscreenViewer } from '@/components/image-fullscreen-viewer';
import { MessageMediaVoice } from '@/components/message-media-voice';
import { MessageMediaVideo } from '@/components/message-media-video';
import { MemoryResurfacing } from '@/components/resurfacing/memory-resurfacing';
import { SupportInvitation } from '@/components/support-invitation';
import { notifyNewMessage, notifyMessageQueued } from '@/lib/notifications';
import type { Message, SyncMessage, PartnerDetail, PartnerDetailTag } from '@/types';
import { nanoid } from 'nanoid';
import { useToast } from '@/hooks/use-toast';
import { compressImage, compressImageWithPreset, cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const QUICK_REACTIONS = [
  { id: 'heart', icon: Heart, color: 'text-accent' },
  { id: 'like', icon: ThumbsUp, color: 'text-blue-400' },
  { id: 'star', icon: Star, color: 'text-yellow-400' },
];

const MESSAGES_PER_PAGE = 50;

export default function ChatPage() {
  const { userId, partnerId, isOnline, isPremium } = useDodi();
  const { toast } = useToast();
  const { send: sendP2P, sendMedia, state: peerState } = usePeerConnection();
  const pendingCount = useOfflineQueueSize();
  const [showInvitation, setShowInvitation] = useState(false);

  useEffect(() => {
    // 5% chance to show invitation on chat open if not premium
    if (!isPremium && Math.random() < 0.05) {
      setShowInvitation(true);
    }
  }, [isPremium]);

  useEffect(() => {
    const handleReconciliation = (event: any) => {
      const count = event.detail.count;
      toast({
        title: "Gardens Synced",
        description: `Reconciled ${count} missing messages from partner`,
      });
    };
    window.addEventListener('reconciliation-complete', handleReconciliation);
    return () => window.removeEventListener('reconciliation-complete', handleReconciliation);
  }, [toast]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [isDisappearing, setIsDisappearing] = useState(false);
  const [lastSyncedTimestamp, setLastSyncedTimestamp] = useState<number>(0);
  const [messageOffset, setMessageOffset] = useState(0);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState<string | null>(null);
  const [saveDetailMessage, setSaveDetailMessage] = useState<Message | null>(null);
  const [saveDetailContent, setSaveDetailContent] = useState('');
  const [saveDetailTag, setSaveDetailTag] = useState<PartnerDetailTag>('remember');
  const [messageFilter, setMessageFilter] = useState<'all' | 'media' | 'voice' | 'video'>('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('oldest');

  const displayedMessages = useMemo(() => {
    let list = messages;
    if (messageFilter === 'media') {
      list = list.filter((m) => m.type === 'image');
    } else if (messageFilter === 'voice') {
      list = list.filter((m) => m.type === 'voice');
    } else if (messageFilter === 'video') {
      list = list.filter((m) => m.type === 'video');
    }
    const ts = (m: Message) => new Date(m.timestamp).getTime();
    return sortOrder === 'oldest' ? [...list].sort((a, b) => ts(a) - ts(b)) : [...list].sort((a, b) => ts(b) - ts(a));
  }, [messages, messageFilter, sortOrder]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLDivElement>(null);

  const adjustMessageInputHeight = useCallback(() => {
    const el = messageInputRef.current;
    if (!el) return;
    el.style.height = '0';
    el.style.overflow = 'hidden';
    const h = el.scrollHeight;
    el.style.overflow = '';
    el.style.height = `${Math.min(Math.max(h, 40), 160)}px`;
  }, []);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const typingThrottleRef = useRef<NodeJS.Timeout | null>(null);
  const doubleTapRef = useRef<{ messageId: string; time: number } | null>(null);
  const disappearingTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const readReceiptsSentRef = useRef<Set<string>>(new Set());
  const [fullscreenImageMessageId, setFullscreenImageMessageId] = useState<string | null>(null);
  const [tabVisible, setTabVisible] = useState(() => typeof document !== 'undefined' ? document.visibilityState === 'visible' : true);
  const [isRecording, setIsRecording] = useState(false);
  const [videoDialogOpen, setVideoDialogOpen] = useState(false);
  const [videoDevices, setVideoDevices] = useState<{ deviceId: string; label: string }[]>([]);
  const [selectedVideoDeviceId, setSelectedVideoDeviceId] = useState('');
  const [videoStage, setVideoStage] = useState<'preview' | 'recording' | 'review'>('preview');
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedBlobUrl, setRecordedBlobUrl] = useState<string | null>(null);
  const [streamForPreview, setStreamForPreview] = useState<MediaStream | null>(null);
  const [videoRecordingError, setVideoRecordingError] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const handler = () => setTabVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  useEffect(() => {
    adjustMessageInputHeight();
  }, [newMessage, adjustMessageInputHeight]);

  // Sync newMessage back to contenteditable when cleared externally (e.g. after send).
  // Only sync when newMessage is empty to avoid overwriting in-flight user input.
  useEffect(() => {
    if (newMessage !== '') return;
    const el = messageInputRef.current;
    if (!el || el.innerText.trim() === '') return;
    el.innerText = '';
    requestAnimationFrame(() => adjustMessageInputHeight());
  }, [newMessage, adjustMessageInputHeight]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const videoRecorderRef = useRef<MediaRecorder | null>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const videoChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    loadMessages();
  }, []);

  // Clean up disappearing-message timers on unmount to avoid setState on unmounted component and memory leaks
  useEffect(() => {
    return () => {
      disappearingTimersRef.current.forEach((id) => clearTimeout(id));
      disappearingTimersRef.current.clear();
    };
  }, []);

  // Clean up voice recording on unmount (stop tracks; avoid setState on unmount)
  useEffect(() => {
    return () => {
      const recorder = mediaRecorderRef.current;
      const stream = recordingStreamRef.current;
      if (recorder?.state !== 'inactive') recorder.stop();
      stream?.getTracks().forEach((t) => t.stop());
      recordingStreamRef.current = null;
      mediaRecorderRef.current = null;
    };
  }, []);

  // Clean up video recording on unmount
  useEffect(() => {
    return () => {
      const recorder = videoRecorderRef.current;
      const stream = videoStreamRef.current;
      if (recorder?.state !== 'inactive') recorder.stop();
      stream?.getTracks().forEach((t) => t.stop());
      videoStreamRef.current = null;
      videoRecorderRef.current = null;
      recordingTimerRef.current && clearInterval(recordingTimerRef.current);
    };
  }, []);

  // When video dialog opens: request camera/mic and enumerate devices
  useEffect(() => {
    if (!videoDialogOpen) return;
    setVideoStage('preview');
    setRecordedBlob(null);
    setRecordedBlobUrl(null);
    setVideoRecordingError(null);
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        videoStreamRef.current = stream;
        setStreamForPreview(stream);
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        const videoInputs = devices
          .filter((d) => d.kind === 'videoinput')
          .map((d) => ({ deviceId: d.deviceId, label: d.label || `Camera ${d.deviceId.slice(0, 8)}` }));
        setVideoDevices(videoInputs);
        if (videoInputs.length > 0) {
          const currentId = stream.getVideoTracks()[0]?.getSettings().deviceId ?? videoInputs[0].deviceId;
          setSelectedVideoDeviceId(currentId);
        }
      } catch (e) {
        if (!cancelled) {
          setVideoRecordingError('Camera and microphone access are needed to record video.');
        }
      }
    })();
    return () => {
      cancelled = true;
      videoStreamRef.current?.getTracks().forEach((t) => t.stop());
      videoStreamRef.current = null;
      setStreamForPreview(null);
      recordingTimerRef.current && clearInterval(recordingTimerRef.current);
    };
  }, [videoDialogOpen]);

  // Keep preview video element in sync with stream
  useEffect(() => {
    const video = previewVideoRef.current;
    const stream = streamForPreview;
    if (video && stream) {
      video.srcObject = stream;
      return () => {
        video.srcObject = null;
      };
    }
  }, [streamForPreview]);

  // Listen for incoming P2P messages
  useEffect(() => {
    if (!peerState.connected || !partnerId) {
      console.log('🔗 [P2P] Chat: Waiting for P2P connection or partnerId', { connected: peerState.connected, partnerId });
      return;
    }

    console.log('🔗 [P2P] Chat: Setting up P2P message listener for partnerId:', partnerId);
    
    const handleP2pMessage = async (event: CustomEvent) => {
      try {
        const message: SyncMessage = event.detail;
        console.log('📩 [P2P] Chat: Received P2P message type:', message.type);
        
        // Handle typing indicator
        if (message.type === 'typing') {
          console.log('⌨️ [P2P] Partner is typing...');
          setIsPartnerTyping(true);
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => {
            setIsPartnerTyping(false);
            console.log('⌨️ [P2P] Typing indicator cleared');
          }, 3000);
          return;
        }
        
        // Handle delivery receipt ACK
        if (message.type === 'ack') {
          const { messageId } = message.data as { messageId: string };
          console.log('✅ [P2P] Message delivered:', messageId);
          setMessages(prev => prev.map(m => 
            m.id === messageId ? { ...m, status: 'delivered' } : m
          ));
          return;
        }

        // Handle read receipt
        if (message.type === 'read') {
          const { messageId } = message.data as { messageId: string };
          console.log('👀 [P2P] Message read:', messageId);
          setMessages(prev => {
            const m = prev.find((x) => x.id === messageId);
            if (!m || m.senderId !== userId) return prev;
            const updated = { ...m, status: 'read' as const };
            queueMicrotask(() => saveMessage(updated).catch(console.error));
            return prev.map((x) => (x.id === messageId ? updated : x));
          });
          return;
        }

        // Handle incoming reaction
        if (message.type === 'reaction') {
          const { messageId, reaction, userId: reactUserId } = message.data as { messageId: string; reaction: string | null; userId: string };
          console.log('💝 [P2P] Received reaction:', reaction, 'for message:', messageId);
          setMessages(prev => prev.map(m => {
            if (m.id === messageId) {
              const newReactions = { ...m.reactions };
              if (reaction) {
                newReactions[reactUserId] = reaction;
              } else {
                delete newReactions[reactUserId];
              }
              return { ...m, reactions: Object.keys(newReactions).length > 0 ? newReactions : undefined };
            }
            return m;
          }));
          return;
        }
        
        if (message.type === 'message') {
          const incomingMessage = message.data as Message;
          
          // Validate sender is our paired partner
          if (incomingMessage.senderId === partnerId) {
            console.log('💾 [P2P] Saving partner message:', incomingMessage.id);
            
            // Handle notification before saving/state update (generic body for privacy)
            notifyNewMessage({ type: incomingMessage.type });

            // Never mutate incomingMessage after putting it into state.
            // If media is embedded (legacy), we store the blob and keep mediaUrl null in state/storage.
            const incomingId = incomingMessage.id;
            const legacyDataUrl =
              incomingMessage.mediaUrl &&
              typeof incomingMessage.mediaUrl === 'string' &&
              incomingMessage.mediaUrl.startsWith('data:image')
                ? (incomingMessage.mediaUrl as string)
                : null;

            const normalizedIncoming: Message = {
              ...incomingMessage,
              mediaUrl: null,
            };

            // Check expiration before adding to state (avoids showing/persisting expired disappearing messages and save/delete race).
            // Use <= so at === now is treated as expired (avoids delay === 0 case where timer would not be scheduled).
            let isExpiredDisappearing = false;
            if (normalizedIncoming.isDisappearing && normalizedIncoming.disappearsAt != null) {
              const raw = normalizedIncoming.disappearsAt;
              const at = raw instanceof Date ? raw.getTime() : (typeof raw === 'string' ? Date.parse(raw) : Number(raw));
              if (Number.isFinite(at) && at <= Date.now()) isExpiredDisappearing = true;
            }

            // Only persist/process if we actually add to UI state (prevents "stored but not shown" duplicates).
            let shouldPersist = true;

            setMessages((prev) => {
              if (prev.some((m) => m.id === incomingId)) {
                console.log('⚠️ [P2P] Message already exists in state, skipping');
                shouldPersist = false;
                return prev;
              }
              if (isExpiredDisappearing) {
                shouldPersist = false;
                return prev;
              }
              return [...prev, normalizedIncoming];
            });

            if (shouldPersist) {
              (async () => {
                try {
                  if (legacyDataUrl) {
                    const { saveMediaBlob } = await import('@/lib/storage');
                    const response = await fetch(legacyDataUrl);
                    const blob = await response.blob();
                    await saveMediaBlob(incomingId, blob, 'message');
                    window.dispatchEvent(
                      new CustomEvent('dodi-media-ready', { detail: { mediaId: incomingId, kind: 'message' } })
                    );
                  }
                  // Skip persisting disappearing messages with very little time left to avoid save/delete race:
                  // if we save and then the timer deletes, save can complete after delete and message persists.
                  const MIN_PERSIST_DISAPPEARING_MS = 1000;
                  let skipSave = false;
                  if (normalizedIncoming.isDisappearing && normalizedIncoming.disappearsAt != null) {
                    const raw = normalizedIncoming.disappearsAt;
                    const at = raw instanceof Date ? raw.getTime() : (typeof raw === 'string' ? Date.parse(raw) : Number(raw));
                    if (Number.isFinite(at) && at - Date.now() < MIN_PERSIST_DISAPPEARING_MS) skipSave = true;
                  }
                  if (!skipSave) await saveMessage(normalizedIncoming);
                } catch (e) {
                  console.error('❌ [P2P] Failed to process incoming media:', e);
                }
              })();
              // Receiver: schedule local delete when disappearing message expires (only non-expired messages reach here).
              if (normalizedIncoming.isDisappearing && normalizedIncoming.disappearsAt != null) {
                const raw = normalizedIncoming.disappearsAt;
                const at = raw instanceof Date ? raw.getTime() : (typeof raw === 'string' ? Date.parse(raw) : Number(raw));
                if (Number.isFinite(at)) {
                  const delay = Math.max(0, at - Date.now());
                  if (delay > 0) {
                    const id = setTimeout(() => {
                      disappearingTimersRef.current.delete(id);
                      deleteMessage(incomingId).catch(() => {});
                      setMessages(prev => prev.filter(m => m.id !== incomingId));
                    }, delay);
                    disappearingTimersRef.current.add(id);
                  } else {
                    // delay === 0 (boundary): delete immediately so message never persists
                    deleteMessage(incomingId).catch(() => {});
                    setMessages(prev => prev.filter(m => m.id !== incomingId));
                  }
                }
              }
            }
            
            // Update last synced timestamp
            const msgTime = new Date(incomingMessage.timestamp).getTime();
            if (msgTime > lastSyncedTimestamp) {
              setLastSyncedTimestamp(msgTime);
            }
            
            // SEND ACK - Confirm delivery
            console.log('📤 [P2P] Sending delivery ACK for:', incomingMessage.id);
            sendP2P({
              type: 'ack',
              data: { messageId: incomingMessage.id },
              timestamp: Date.now(),
            });
          } else {
            console.warn('🚫 [P2P] Message from unknown sender:', incomingMessage.senderId);
          }
        }
      } catch (error) {
        console.error('❌ [P2P] Error handling P2P message:', error);
      }
    };

    const handleMessageDeleted = (e: Event) => {
      const { messageId } = (e as CustomEvent<{ messageId: string }>).detail || {};
      if (messageId) {
        setMessages(prev => prev.filter(m => m.id !== messageId));
      }
    };

    window.addEventListener('p2p-message', handleP2pMessage as unknown as EventListener);
    window.addEventListener('message-deleted', handleMessageDeleted);
    console.log('✅ [P2P] Chat: P2P message listener attached');
    
    return () => {
      console.log('🧹 [P2P] Chat: Cleaning up P2P message listener');
      window.removeEventListener('p2p-message', handleP2pMessage as unknown as EventListener);
      window.removeEventListener('message-deleted', handleMessageDeleted);
    };
  }, [peerState.connected, partnerId, lastSyncedTimestamp]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const scrollToBottom = () => {
      el.scrollTop = el.scrollHeight;
    };
    const isNearBottom = () => {
      const threshold = 120;
      return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    };
    const maybeScroll = () => {
      if (isNearBottom()) scrollToBottom();
    };
    // Defer until after DOM/layout so new messages are rendered before we scroll
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(scrollToBottom);
    });
    // When content grows (e.g. images load), scroll only if user was near bottom
    const ro = new ResizeObserver(maybeScroll);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(id);
      ro.disconnect();
    };
  }, [messages, messageFilter, sortOrder]);

  // Update queued messages to 'sent' when connection is restored
  useEffect(() => {
    if (peerState.connected) {
      setMessages(prev => {
        const hasQueued = prev.some(m => m.status === 'queued');
        if (hasQueued) {
          console.log('🔄 [P2P] Connection restored - updating queued messages to sent');
          return prev.map(m => 
            m.status === 'queued' ? { ...m, status: 'sent' as const } : m
          );
        }
        return prev;
      });
    }
  }, [peerState.connected]);

  // Send read receipts when chat is visible and user sees messages from partner
  useEffect(() => {
    if (!peerState.connected || !partnerId || !tabVisible) return;
    const fromPartner = messages.filter(m => m.senderId === partnerId);
    const toMark = fromPartner.filter(m => !readReceiptsSentRef.current.has(m.id));
    if (toMark.length === 0) return;
    for (const m of toMark) {
      readReceiptsSentRef.current.add(m.id);
      sendP2P({
        type: 'read',
        data: { messageId: m.id },
        timestamp: Date.now(),
      });
    }
  }, [messages, partnerId, peerState.connected, sendP2P, tabVisible]);

  const loadMessages = async () => {
    const msgs = await getMessages(MESSAGES_PER_PAGE, 0);
    const now = Date.now();
    const valid: Message[] = [];
    for (const m of msgs) {
      if (!m.disappearsAt) {
        valid.push(m);
        continue;
      }
      const at = m.disappearsAt instanceof Date ? m.disappearsAt.getTime() : Number(m.disappearsAt);
      if (at > now) valid.push(m);
      else void deleteMessage(m.id).catch(() => {});
    }
    setMessages(valid);
    setMessageOffset(0);
    setHasMoreMessages(valid.length === MESSAGES_PER_PAGE);
  };

  const loadMoreMessages = async () => {
    setLoadingMore(true);
    const newOffset = messageOffset + MESSAGES_PER_PAGE;
    const msgs = await getMessages(MESSAGES_PER_PAGE, newOffset);
    const now = Date.now();
    const valid: Message[] = [];
    for (const m of msgs) {
      if (!m.disappearsAt) {
        valid.push(m);
        continue;
      }
      const at = m.disappearsAt instanceof Date ? m.disappearsAt.getTime() : Number(m.disappearsAt);
      if (at > now) valid.push(m);
      else void deleteMessage(m.id).catch(() => {});
    }
    setMessages(prev => [...valid, ...prev]);
    setMessageOffset(newOffset);
    setHasMoreMessages(valid.length === MESSAGES_PER_PAGE);
    setLoadingMore(false);
  };

  const handleReaction = useCallback((messageId: string, reaction: string) => {
    if (!userId) return;
    
    setMessages(prev => prev.map(m => {
      if (m.id === messageId) {
        const currentReaction = m.reactions?.[userId];
        const newReactions = { ...m.reactions };
        
        if (currentReaction === reaction) {
          delete newReactions[userId];
        } else {
          newReactions[userId] = reaction;
        }
        
        const finalReaction = currentReaction === reaction ? null : reaction;
        
        sendP2P({
          type: 'reaction',
          data: { messageId, reaction: finalReaction, userId },
          timestamp: Date.now(),
        });
        
        return { ...m, reactions: Object.keys(newReactions).length > 0 ? newReactions : undefined };
      }
      return m;
    }));
    setShowReactionPicker(null);
  }, [userId, sendP2P]);

  const handleMessageTap = useCallback((messageId: string, isImage?: boolean) => {
    const now = Date.now();
    if (doubleTapRef.current?.messageId === messageId && now - doubleTapRef.current.time < 300) {
      handleReaction(messageId, 'heart');
      doubleTapRef.current = null;
    } else if (isImage) {
      setFullscreenImageMessageId(messageId);
    } else {
      doubleTapRef.current = { messageId, time: now };
    }
  }, [handleReaction]);

  const handleOpenSaveDetail = useCallback((message: Message) => {
    const content = message.type === 'text' && message.content
      ? message.content.slice(0, 500)
      : `Message from ${new Date(message.timestamp).toLocaleDateString()}`;
    setSaveDetailMessage(message);
    setSaveDetailContent(content);
    setSaveDetailTag('remember');
    setShowReactionPicker(null);
  }, []);

  const handleSaveDetail = useCallback(async () => {
    if (!saveDetailMessage || !saveDetailContent.trim() || !userId || !partnerId) return;
    const detail: PartnerDetail = {
      id: nanoid(),
      userId,
      partnerId,
      content: saveDetailContent.trim(),
      tag: saveDetailTag,
      messageId: saveDetailMessage.id,
      messageContext: saveDetailMessage.type === 'text' ? saveDetailMessage.content.slice(0, 200) : undefined,
      createdAt: new Date(),
    };
    try {
      await savePartnerDetail(detail);
      sendP2P({ type: 'partner_detail', data: detail, timestamp: Date.now() });
      setSaveDetailMessage(null);
      setSaveDetailContent('');
      setSaveDetailTag('remember');
      toast({ title: 'Saved to Moments', description: 'Added to Moments → Details.' });
    } catch (e) {
      console.warn('Failed to save partner detail:', e);
      toast({ title: 'Could not save', description: 'Something went wrong. Please try again.', variant: 'destructive' });
    }
  }, [saveDetailMessage, saveDetailContent, saveDetailTag, userId, partnerId, sendP2P, toast]);

  const handleSend = async () => {
    if (!newMessage.trim()) {
      return;
    }

    if (!userId || !partnerId) {
      toast({
        title: "Not paired",
        description: "Please pair with your beloved first",
        variant: "destructive",
      });
      return;
    }

    // OFFLINE QUEUING: Don't block when offline - let P2P layer queue it
    const isOffline = !peerState.connected;

    setSending(true);
    try {
      const messageId = nanoid();
      const now = new Date();
      const DISAPPEAR_MS = 30_000;
      const disappearsAt = isDisappearing ? new Date(Date.now() + DISAPPEAR_MS) : undefined;

      // Use 'queued' status when offline, 'sending' when online
      const message: Message = {
        id: messageId,
        senderId: userId,
        recipientId: partnerId,
        content: newMessage,
        type: 'text',
        mediaUrl: null,
        isDisappearing: isDisappearing ?? undefined,
        disappearsAt: disappearsAt ?? undefined,
        timestamp: now,
        status: isOffline ? 'queued' : 'sending',
      };

      // Save to IndexedDB first (encrypted) - works offline
      await saveMessage(message);

      // Add to local state immediately
      setMessages(prev => [...prev, message]);
      // Clear contenteditable synchronously to avoid race: if we only setState, the DOM
      // isn't cleared until useEffect runs; user could type in the window and prepend to old text
      if (messageInputRef.current) messageInputRef.current.innerText = '';
      setNewMessage('');

      // Send via P2P data channel - if offline, P2P layer queues it automatically
      console.log(`📤 [P2P] Starting send process for:`, messageId, 'Offline:', isOffline);
      
      // Ensure the message object is clean before sending
      const messageToSend = { ...message };
      
      sendP2P({
        type: 'message',
        data: messageToSend,
        timestamp: Date.now(),
      });

      // NO UI UPDATE based on isOffline here - the status is already correct in the message object
      if (isOffline) {
        toast({
          title: "Waiting for partner",
          description: "Message queued and will send once you're both online",
        });
      }
      
      if (isDisappearing) {
        const id = setTimeout(() => {
          disappearingTimersRef.current.delete(id);
          setMessages(prev => prev.filter(m => m.id !== messageId));
          deleteMessage(messageId).catch(e => console.warn('Delete disappearing message:', e));
          sendP2P({ type: 'message-delete', data: { messageId }, timestamp: Date.now() });
        }, DISAPPEAR_MS);
        disappearingTimersRef.current.add(id);
      }
    } catch (error) {
      console.error('❌ [P2P] Send error:', error);
      toast({
        title: "Couldn't send",
        description: "Try again when you're back online, or check your connection.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const handleTyping = () => {
    if (!peerState.connected || !partnerId) return;
    
    // Throttle typing indicator - send max once per second
    if (!typingThrottleRef.current) {
      console.log('⌨️ [P2P] Sending typing indicator');
      sendP2P({
        type: 'typing',
        data: {},
        timestamp: Date.now(),
      });
      
      typingThrottleRef.current = setTimeout(() => {
        typingThrottleRef.current = null;
      }, 1000);
    }
  };

  const handleThinkingOfYou = async () => {
    if (!partnerId || !peerState.connected) {
      toast({
        title: "Not connected",
        description: "Connect with your beloved to send a heart",
        variant: "destructive",
      });
      return;
    }
    sendP2P({ type: 'thinking-of-you', data: {}, timestamp: Date.now() });
    toast({
      title: "Thinking of you",
      description: "Heart sent to your beloved",
    });
  };

  const handleImageClick = () => {
    console.log('Image button clicked!');
    fileInputRef.current?.click();
  };

  const handleVoiceClick = async () => {
    if (!userId || !partnerId) {
      toast({
        title: "Not paired",
        description: "Please pair with your beloved first",
        variant: "destructive",
      });
      return;
    }

    if (isRecording) {
      // Stop recording and send; always release stream so tracks are stopped (avoid leak)
      const recorder = mediaRecorderRef.current;
      const stream = recordingStreamRef.current;
      if (recorder?.state !== 'inactive') recorder.stop();
      stream?.getTracks().forEach((t) => t.stop());
      recordingStreamRef.current = null;
      mediaRecorderRef.current = null;
      setIsRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingStreamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recordingChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordingChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(recordingChunksRef.current, { type: mimeType });
        recordingChunksRef.current = [];
        if (blob.size === 0) {
          toast({ title: "No audio", description: "Recording was too short", variant: "destructive" });
          return;
        }

        setSending(true);
        try {
          const messageId = nanoid();
          const now = new Date();
          const isOffline = !peerState.connected;
          const DISAPPEAR_MS = 30_000;
          const disappearsAt = isDisappearing ? new Date(Date.now() + DISAPPEAR_MS) : undefined;

          const message: Message = {
            id: messageId,
            senderId: userId,
            recipientId: partnerId,
            content: 'Voice message',
            type: 'voice',
            mediaUrl: null,
            isDisappearing: isDisappearing ?? undefined,
            disappearsAt: disappearsAt ?? undefined,
            timestamp: now,
            status: isOffline ? 'queued' : 'sending',
          };

          const { saveMediaBlob } = await import('@/lib/storage');
          await saveMediaBlob(messageId, blob, 'message');
          await saveMessage(message);
          setMessages((prev) => [...prev, message]);

          sendP2P({ type: 'message', data: { ...message, mediaUrl: null }, timestamp: Date.now() });
          await sendMedia({ mediaId: messageId, kind: 'message', mime: blob.type || mimeType });

          if (isOffline) {
            toast({ title: "Waiting for partner", description: "Voice message queued" });
          }

          if (isDisappearing) {
            const id = setTimeout(() => {
              disappearingTimersRef.current.delete(id);
              setMessages((prev) => prev.filter((m) => m.id !== messageId));
              deleteMessage(messageId).catch((e) => console.warn('Delete disappearing message:', e));
              sendP2P({ type: 'message-delete', data: { messageId }, timestamp: Date.now() });
            }, DISAPPEAR_MS);
            disappearingTimersRef.current.add(id);
          }
        } catch (err) {
          console.error('Voice send error:', err);
          toast({
            title: "Voice message didn't send",
            description: "Try again when you're back online.",
            variant: "destructive",
          });
        } finally {
          setSending(false);
        }
      };

      recorder.start(100);
      setIsRecording(true);
      toast({ title: "Recording…", description: "Tap the mic again to send" });
    } catch (err) {
      console.error('Microphone error:', err);
      toast({
        title: "Microphone access needed",
        description: "Allow microphone in your browser settings to send voice messages.",
        variant: "destructive",
      });
    }
  };

  const handleVideoClick = () => {
    if (!userId || !partnerId) {
      toast({
        title: "Not paired",
        description: "Please pair with your beloved first",
        variant: "destructive",
      });
      return;
    }
    setVideoDialogOpen(true);
  };

  const handleVideoDialogClose = () => {
    if (videoRecorderRef.current?.state !== 'inactive') videoRecorderRef.current.stop();
    videoStreamRef.current?.getTracks().forEach((t) => t.stop());
    videoStreamRef.current = null;
    setStreamForPreview(null);
    if (recordedBlobUrl) URL.revokeObjectURL(recordedBlobUrl);
    setVideoDialogOpen(false);
    setVideoStage('preview');
    setRecordedBlob(null);
    setRecordedBlobUrl(null);
    setVideoDevices([]);
    setSelectedVideoDeviceId('');
    setVideoRecordingError(null);
    setRecordingSeconds(0);
    recordingTimerRef.current && clearInterval(recordingTimerRef.current);
  };

  const handleVideoCameraChange = useCallback(async (deviceId: string) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId ? { deviceId: { exact: deviceId } } : true,
        audio: true,
      });
      videoStreamRef.current?.getTracks().forEach((t) => t.stop());
      videoStreamRef.current = stream;
      setStreamForPreview(stream);
      setSelectedVideoDeviceId(deviceId);
    } catch (e) {
      console.error('Switch camera error:', e);
      toast({ title: 'Could not switch camera', description: 'Try another camera or allow access.', variant: 'destructive' });
    }
  }, [toast]);

  const handleStartVideoRecording = useCallback(() => {
    const stream = videoStreamRef.current;
    if (!stream) return;
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : MediaRecorder.isTypeSupported('video/webm')
        ? 'video/webm'
        : 'video/mp4';
    const recorder = new MediaRecorder(stream);
    videoRecorderRef.current = recorder;
    videoChunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) videoChunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(videoChunksRef.current, { type: mimeType });
      videoChunksRef.current = [];
      recordingTimerRef.current && clearInterval(recordingTimerRef.current);
      setRecordingSeconds(0);
      if (blob.size === 0) {
        setVideoRecordingError('Recording too short. Try again.');
        setVideoStage('preview');
        videoStreamRef.current?.getTracks().forEach((t) => t.stop());
        videoStreamRef.current = null;
        setStreamForPreview(null);
        return;
      }
      const url = URL.createObjectURL(blob);
      setRecordedBlob(blob);
      setRecordedBlobUrl(url);
      setVideoStage('review');
      setVideoRecordingError(null);
      videoStreamRef.current?.getTracks().forEach((t) => t.stop());
      videoStreamRef.current = null;
      setStreamForPreview(null);
    };
    recorder.start(200);
    setVideoStage('recording');
    setVideoRecordingError(null);
    setRecordingSeconds(0);
    recordingTimerRef.current = setInterval(() => {
      setRecordingSeconds((s) => s + 1);
    }, 1000);
  }, []);

  const handleStopVideoRecording = useCallback(() => {
    if (videoRecorderRef.current?.state !== 'inactive') videoRecorderRef.current.stop();
  }, []);

  const handleVideoRetry = useCallback(async () => {
    if (recordedBlobUrl) URL.revokeObjectURL(recordedBlobUrl);
    setRecordedBlob(null);
    setRecordedBlobUrl(null);
    setVideoStage('preview');
    setVideoRecordingError(null);
    videoStreamRef.current?.getTracks().forEach((t) => t.stop());
    videoStreamRef.current = null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: selectedVideoDeviceId ? { deviceId: { exact: selectedVideoDeviceId } } : true,
        audio: true,
      });
      videoStreamRef.current?.getTracks().forEach((t) => t.stop());
      videoStreamRef.current = stream;
      setStreamForPreview(stream);
    } catch (e) {
      setVideoRecordingError('Could not reopen camera. Close and try again.');
    }
  }, [recordedBlobUrl, selectedVideoDeviceId]);

  const handleVideoSend = useCallback(async () => {
    if (!recordedBlob || !userId || !partnerId) return;
    setSending(true);
    try {
      const messageId = nanoid();
      const now = new Date();
      const isOffline = !peerState.connected;
      const DISAPPEAR_MS = 30_000;
      const disappearsAt = isDisappearing ? new Date(Date.now() + DISAPPEAR_MS) : undefined;
      const message: Message = {
        id: messageId,
        senderId: userId,
        recipientId: partnerId,
        content: 'Video message',
        type: 'video',
        mediaUrl: null,
        isDisappearing: isDisappearing ?? undefined,
        disappearsAt: disappearsAt ?? undefined,
        timestamp: now,
        status: isOffline ? 'queued' : 'sending',
      };
      const { saveMediaBlob } = await import('@/lib/storage');
      await saveMediaBlob(messageId, recordedBlob, 'message');
      await saveMessage(message);
      setMessages((prev) => [...prev, message]);
      sendP2P({ type: 'message', data: { ...message, mediaUrl: null }, timestamp: Date.now() });
      await sendMedia({ mediaId: messageId, kind: 'message', mime: recordedBlob.type || 'video/webm' });
      if (isOffline) toast({ title: 'Waiting for partner', description: 'Video message queued' });
      if (isDisappearing) {
        const tid = setTimeout(() => {
          disappearingTimersRef.current.delete(tid);
          setMessages((prev) => prev.filter((m) => m.id !== messageId));
          deleteMessage(messageId).catch((e) => console.warn('Delete disappearing message:', e));
          sendP2P({ type: 'message-delete', data: { messageId }, timestamp: Date.now() });
        }, DISAPPEAR_MS);
        disappearingTimersRef.current.add(tid);
      }
      if (recordedBlobUrl) URL.revokeObjectURL(recordedBlobUrl);
      setVideoDialogOpen(false);
      setRecordedBlob(null);
      setRecordedBlobUrl(null);
      setVideoStage('preview');
      setStreamForPreview(null);
      videoStreamRef.current = null;
      toast({ title: 'Video sent' });
    } catch (err) {
      console.error('Video send error:', err);
      toast({ title: "Video didn't send", description: "Try again when you're back online.", variant: 'destructive' });
    } finally {
      setSending(false);
    }
  }, [recordedBlob, recordedBlobUrl, userId, partnerId, peerState.connected, isDisappearing, sendP2P, sendMedia, toast]);

  const processImageFile = useCallback(async (file: File) => {
    const displayName = file.name || `pasted.${(file.type.split('/')[1] || 'image')}`;
    const isGif = file.type === 'image/gif';
    setSending(true);
    try {
      const messageId = nanoid();
      const now = new Date();
      const isOffline = !peerState.connected;

      const { saveMediaBlob } = await import('@/lib/storage');
      const { getSetting } = await import('@/lib/storage-encrypted');
      const imageSendMode = (await getSetting('imageSendMode')) || 'balanced';

      // GIFs: use as-is to preserve animation; photos: compress
      let previewBlob: Blob;
      if (isGif) {
        previewBlob = file;
      } else {
        const previewPreset = imageSendMode === 'aggressive' ? 'aggressive' : 'balanced';
        console.log('🖼️ Compressing preview...');
        previewBlob = await compressImageWithPreset(file, previewPreset);
      }
      await saveMediaBlob(messageId, previewBlob, 'message', 'preview');

      const DISAPPEAR_MS = 30_000;
      const disappearsAt = isDisappearing ? new Date(Date.now() + DISAPPEAR_MS) : undefined;
      const message: Message = {
        id: messageId,
        senderId: userId!,
        recipientId: partnerId!,
        content: displayName,
        type: 'image',
        mediaUrl: null,
        isDisappearing: isDisappearing ?? undefined,
        disappearsAt: disappearsAt ?? undefined,
        timestamp: now,
        status: isOffline ? 'queued' : 'sending',
      };

      await saveMessage(message);

      // Add to local state
      setMessages(prev => [...prev, message]);

      // Send message metadata (small, queue-friendly)
      sendP2P({
        type: 'message',
        data: { ...message, mediaUrl: null },
        timestamp: Date.now(),
      });

      // Send preview first (chat list)
      await sendMedia({ mediaId: messageId, kind: 'message', mime: previewBlob.type || file.type || 'image/jpeg' });

      // Send full in background (photos: balanced/full mode; GIFs: already full)
      if (!isGif && (imageSendMode === 'balanced' || imageSendMode === 'full') && file.size !== previewBlob.size) {
        const trySendFull = async () => {
          try {
            await saveMediaBlob(messageId, file, 'message', 'full');
            await sendMedia({ mediaId: messageId, kind: 'message', mime: file.type || 'image/jpeg', variant: 'full', blob: file });
          } catch {
            const fallback = await compressImage(file, 960, 0.5);
            await saveMediaBlob(messageId, fallback, 'message', 'full');
            await sendMedia({ mediaId: messageId, kind: 'message', mime: 'image/jpeg', variant: 'full', blob: fallback });
          }
        };
        void trySendFull().catch((err) => {
          console.warn('🖼️ [MEDIA] Full-quality send failed, will retry when online:', err);
          toast({ title: 'Full-quality sync delayed', description: 'Will send when connection is stable.', variant: 'default' });
        });
      }

      toast({
        title: isOffline ? "Image queued" : "Image sending",
      });

      if (isDisappearing) {
        const id = setTimeout(() => {
          disappearingTimersRef.current.delete(id);
          setMessages((prev) => prev.filter((m) => m.id !== messageId));
          deleteMessage(messageId).catch((e) => console.warn('Delete disappearing message:', e));
          sendP2P({ type: 'message-delete', data: { messageId }, timestamp: Date.now() });
        }, DISAPPEAR_MS);
        disappearingTimersRef.current.add(id);
      }

      setSending(false);
    } catch (error) {
      console.error('Image send error:', error);
      toast({
        title: "Image didn't send",
        description: "Try again when you're back online.",
        variant: "destructive",
      });
      setSending(false);
    }
  }, [userId, partnerId, peerState.connected, isDisappearing, sendP2P, sendMedia, toast]);

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: "Not an image", description: "Please choose a photo or GIF (JPEG, PNG, GIF, etc.).", variant: "destructive" });
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      toast({ title: "Image too large", description: "Please choose an image under 25MB.", variant: "destructive" });
      return;
    }
    await processImageFile(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    // #region agent log
    const clipTypes = e.clipboardData ? Array.from(e.clipboardData.types) : [];
    const hasImageItem = items && Array.from(items).some((i) => i.type.startsWith('image/'));
    let htmlPrefix = '';
    if (e.clipboardData?.types.includes('text/html')) {
      const h = e.clipboardData.getData('text/html');
      htmlPrefix = h.slice(0, 300).replace(/\s+/g, ' ');
    }
    fetch('http://127.0.0.1:7242/ingest/48a62d14-14c2-4f21-9c07-fb4b93f7157a', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '762ed6' }, body: JSON.stringify({ sessionId: '762ed6', location: 'chat.tsx:handlePaste', message: 'paste fired', data: { clipboardTypes: clipTypes, hasImageItem, htmlLength: e.clipboardData?.getData('text/html')?.length ?? 0, htmlPrefix }, timestamp: Date.now(), hypothesisId: 'H1' }) }).catch(() => {});
    // #endregion
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          if (file.size > 25 * 1024 * 1024) {
            toast({ title: "Image too large", description: "Please choose an image under 25MB.", variant: "destructive" });
            return;
          }
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/48a62d14-14c2-4f21-9c07-fb4b93f7157a', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '762ed6' }, body: JSON.stringify({ sessionId: '762ed6', location: 'chat.tsx:handlePaste', message: 'processImageFile from clipboard item', data: { mime: file.type, size: file.size }, timestamp: Date.now(), hypothesisId: 'H2' }) }).catch(() => {});
          // #endregion
          processImageFile(file);
        }
        return;
      }
    }
    // Fallback: extract image from text/html (Gboard may embed GIF as data URL in HTML)
    const html = e.clipboardData?.getData('text/html');
    if (html) {
      const imgMatch = html.match(/<img[^>]+src\s*=\s*["'](data:image\/[^"']+)["']/i);
      // #region agent log
      const altMatch = html.match(/<img[^>]+src\s*=\s*["']([^"']+)["']/i);
      fetch('http://127.0.0.1:7242/ingest/48a62d14-14c2-4f21-9c07-fb4b93f7157a', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '762ed6' }, body: JSON.stringify({ sessionId: '762ed6', location: 'chat.tsx:handlePaste', message: 'html fallback', data: { dataUrlMatch: !!imgMatch, srcPrefix: altMatch ? altMatch[1].slice(0, 80) : null }, timestamp: Date.now(), hypothesisId: 'H3' }) }).catch(() => {});
      // #endregion
      if (imgMatch) {
        const dataUrl = imgMatch[1];
        if (dataUrl.startsWith('data:image/')) {
          e.preventDefault();
          try {
            const res = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
            if (res) {
              const mime = `image/${res[1]}`;
              const b64 = atob(res[2]);
              const bytes = new Uint8Array(b64.length);
              for (let i = 0; i < b64.length; i++) bytes[i] = b64.charCodeAt(i);
              const blob = new Blob([bytes], { type: mime });
              if (blob.size > 25 * 1024 * 1024) {
                toast({ title: "Image too large", description: "Please choose an image under 25MB.", variant: "destructive" });
                return;
              }
              const file = new File([blob], `pasted.${res[1]}`, { type: mime });
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/48a62d14-14c2-4f21-9c07-fb4b93f7157a', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '762ed6' }, body: JSON.stringify({ sessionId: '762ed6', location: 'chat.tsx:handlePaste', message: 'processImageFile from html data URL', data: { mime, size: blob.size }, timestamp: Date.now(), hypothesisId: 'H4' }) }).catch(() => {});
              // #endregion
              processImageFile(file);
            }
          } catch (err) {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/48a62d14-14c2-4f21-9c07-fb4b93f7157a', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '762ed6' }, body: JSON.stringify({ sessionId: '762ed6', location: 'chat.tsx:handlePaste', message: 'html data URL parse error', data: { err: String(err) }, timestamp: Date.now(), hypothesisId: 'H5' }) }).catch(() => {});
            // #endregion
          }
        }
      }
    }
  }, [processImageFile, toast]);

  const isVideoRecordingActive = videoDialogOpen && videoStage === 'recording';

  return (
    <div className="flex-1 min-h-0 min-w-0 flex flex-col bg-background">
      <MemoryResurfacing />
      {showInvitation && <SupportInvitation onDismiss={() => setShowInvitation(false)} triggerReason="A growing connection..." />}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b bg-card/50">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-full bg-gradient-to-br from-sage to-blush flex items-center justify-center ${peerState.connected ? 'animate-gentle-pulse' : ''}`}>
            <Heart className="w-4 h-4 text-white" />
          </div>
          <h2 className="font-medium text-foreground">my beloved</h2>
        </div>

        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <Badge 
              variant="outline" 
              className="bg-amber-500/10 text-amber-600 border-amber-500/30 gap-1 text-xs"
              data-testid="badge-pending-messages"
            >
              <CloudOff className="w-3 h-3" />
              {pendingCount} pending
            </Badge>
          )}
          <Button
            onClick={handleThinkingOfYou}
            size="icon"
            variant="ghost"
            className="text-accent flex-shrink-0"
            data-testid="button-thinking-of-you"
          >
            <Heart className="w-5 h-5 animate-gentle-pulse" />
          </Button>
        </div>
      </div>

      {/* Quick find: filter and sort within loaded messages */}
      {messages.length > 0 && (
        <div className="flex-shrink-0 px-4 py-2 border-b bg-muted/30 flex flex-wrap items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" aria-hidden />
          <ToggleGroup
            type="single"
            value={messageFilter}
            onValueChange={(v) => v && setMessageFilter(v as 'all' | 'media' | 'voice' | 'video')}
            className="gap-0"
            size="sm"
          >
            <ToggleGroupItem value="all" aria-label="All messages" className="text-xs px-2 py-1">All</ToggleGroupItem>
            <ToggleGroupItem value="media" aria-label="Photos only" className="text-xs px-2 py-1">Photos</ToggleGroupItem>
            <ToggleGroupItem value="voice" aria-label="Voice only" className="text-xs px-2 py-1">Voice</ToggleGroupItem>
            <ToggleGroupItem value="video" aria-label="Videos only" className="text-xs px-2 py-1">Videos</ToggleGroupItem>
          </ToggleGroup>
          <span className="text-muted-foreground text-xs">·</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground"
            onClick={() => setSortOrder((o) => (o === 'newest' ? 'oldest' : 'newest'))}
          >
            {sortOrder === 'newest' ? 'Newest first' : 'Oldest first'}
          </Button>
        </div>
      )}

      {/* Offline / Reconnecting banner */}
      {!peerState.connected && (
        <div className="flex-shrink-0 px-4 py-2 bg-amber-500/15 border-b border-amber-500/30 flex items-center gap-2 text-amber-800 dark:text-amber-200 text-sm">
          {peerState.isReconnecting ? (
            <>
              <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
              <span>
                Reconnecting to your partner… {pendingCount > 0 ? `${pendingCount} message${pendingCount === 1 ? '' : 's'} will send when connected.` : 'Messages will send when connected.'}
              </span>
            </>
          ) : (
            <>
              <CloudOff className="w-4 h-4 shrink-0" />
              <span>
                {pendingCount > 0
                  ? `You're offline. ${pendingCount} message${pendingCount === 1 ? '' : 's'} will send when you're back online.`
                  : "You're offline. Messages will send when you're back online."}
              </span>
            </>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-6" ref={scrollRef}>
        <div className="space-y-4 max-w-3xl mx-auto">
          {displayedMessages.length === 0 && (
            <div className="text-center py-12 space-y-3">
              <div className="w-16 h-16 mx-auto rounded-full bg-sage/20 flex items-center justify-center">
                <Heart className="w-8 h-8 text-sage" />
              </div>
              <p className="text-muted-foreground">
                {messageFilter === 'all'
                  ? 'Start your first conversation'
                  : messageFilter === 'media'
                    ? 'No photos in loaded messages'
                    : messageFilter === 'voice'
                      ? 'No voice messages in loaded messages'
                      : messageFilter === 'video'
                        ? 'No video messages in loaded messages'
                        : 'No messages'}
              </p>
            </div>
          )}

          {hasMoreMessages && messages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={loadMoreMessages}
              disabled={loadingMore}
              className="mx-auto w-full"
              data-testid="button-load-more-messages"
            >
              <ChevronUp className="w-4 h-4 mr-2" />
              {loadingMore ? 'Loading...' : 'Load Earlier Messages'}
            </Button>
          )}

          {displayedMessages.map((message) => {
            const isSent = message.senderId === userId;
            const isImage = message.type === 'image';
            const isVoice = message.type === 'voice';
            const isVideo = message.type === 'video';
            const hasReactions = message.reactions && Object.keys(message.reactions).length > 0;
            const myReaction = userId ? message.reactions?.[userId] : null;
            const partnerReaction = partnerId ? message.reactions?.[partnerId] : null;
            
            return (
              <div
                key={message.id}
                className={`flex ${isSent ? 'justify-end' : 'justify-start'} animate-fade-in relative`}
                data-testid={`message-${message.id}`}
              >
                <div className="relative">
                  <Card
                    onClick={() => handleMessageTap(message.id, isImage)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setShowReactionPicker(showReactionPicker === message.id ? null : message.id);
                    }}
                    className={cn(
                      'cursor-pointer transition-transform active:scale-[0.98]',
                      isVideo ? 'max-w-[min(90vw,480px)]' : 'max-w-[70%]',
                      (isImage || isVoice || isVideo) ? 'p-0 overflow-hidden' : 'p-4',
                      isSent ? 'bg-sage/30 border-sage/40' : 'bg-card border-card-border'
                    )}
                  >
                    {isImage ? (
                      <div className="space-y-2">
                        <MessageMediaImage messageId={message.id} fileName={message.content} />
                        <div className="flex items-center justify-between px-3 pb-2">
                          <div className="flex items-center gap-1.5">
                            {message.isDisappearing && <EyeOff className="w-3 h-3 text-muted-foreground shrink-0" title="Disappearing message" />}
                            <p className="text-xs text-muted-foreground">
                              {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                          {isSent && (
                            <div className="ml-2">
                              {message.status === 'queued' && <Clock className="w-3 h-3 text-amber-500" />}
                              {message.status === 'sending' && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                              {message.status === 'sent' && <Check className="w-3 h-3 text-muted-foreground" />}
                              {message.status === 'delivered' && <CheckCheck className="w-3 h-3 text-blue-400" />}
                              {message.status === 'read' && <CheckCheck className="w-3 h-3 text-accent" />}
                              {!message.status && <Check className="w-3 h-3 text-muted-foreground" />}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : isVoice ? (
                      <div className="space-y-2 p-2">
                        <MessageMediaVoice messageId={message.id} />
                        <div className="flex items-center justify-between px-2 pb-1">
                          <div className="flex items-center gap-1.5">
                            {message.isDisappearing && <EyeOff className="w-3 h-3 text-muted-foreground shrink-0" title="Disappearing message" />}
                            <p className="text-xs text-muted-foreground">
                              {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                          {isSent && (
                            <div className="ml-2">
                              {message.status === 'queued' && <Clock className="w-3 h-3 text-amber-500" />}
                              {message.status === 'sending' && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                              {message.status === 'sent' && <Check className="w-3 h-3 text-muted-foreground" />}
                              {message.status === 'delivered' && <CheckCheck className="w-3 h-3 text-blue-400" />}
                              {message.status === 'read' && <CheckCheck className="w-3 h-3 text-accent" />}
                              {!message.status && <Check className="w-3 h-3 text-muted-foreground" />}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : isVideo ? (
                      <div className="space-y-2 p-2">
                        <MessageMediaVideo messageId={message.id} />
                        <div className="flex items-center justify-between px-2 pb-1">
                          <div className="flex items-center gap-1.5">
                            {message.isDisappearing && <EyeOff className="w-3 h-3 text-muted-foreground shrink-0" title="Disappearing message" />}
                            <p className="text-xs text-muted-foreground">
                              {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                          {isSent && (
                            <div className="ml-2">
                              {message.status === 'queued' && <Clock className="w-3 h-3 text-amber-500" />}
                              {message.status === 'sending' && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                              {message.status === 'sent' && <Check className="w-3 h-3 text-muted-foreground" />}
                              {message.status === 'delivered' && <CheckCheck className="w-3 h-3 text-blue-400" />}
                              {message.status === 'read' && <CheckCheck className="w-3 h-3 text-accent" />}
                              {!message.status && <Check className="w-3 h-3 text-muted-foreground" />}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm leading-relaxed">{message.content}</p>
                        <div className="flex items-center justify-between mt-2 gap-2">
                          <div className="flex items-center gap-1.5">
                            {message.isDisappearing && <EyeOff className="w-3 h-3 text-muted-foreground shrink-0" title="Disappearing message" />}
                            <p className="text-xs text-muted-foreground">
                              {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                          {isSent && (
                            <div className="ml-2">
                              {message.status === 'queued' && <Clock className="w-3 h-3 text-amber-500" />}
                              {message.status === 'sending' && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                              {message.status === 'sent' && <Check className="w-3 h-3 text-muted-foreground" />}
                              {message.status === 'delivered' && <CheckCheck className="w-3 h-3 text-blue-400" />}
                              {message.status === 'read' && <CheckCheck className="w-3 h-3 text-accent" />}
                              {!message.status && <Check className="w-3 h-3 text-muted-foreground" />}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </Card>

                  {hasReactions && (
                    <div className={cn(
                      'absolute -bottom-2 flex gap-0.5',
                      isSent ? 'right-2' : 'left-2'
                    )}>
                      {(myReaction || partnerReaction) && (
                        <span className="text-sm bg-card border rounded-full px-1.5 py-0.5 shadow-sm flex items-center gap-0.5">
                          {myReaction === 'heart' && <Heart className="w-3 h-3 text-accent fill-current" />}
                          {myReaction === 'like' && <ThumbsUp className="w-3 h-3 text-blue-400" />}
                          {myReaction === 'star' && <Star className="w-3 h-3 text-yellow-400 fill-current" />}
                          {partnerReaction && partnerReaction !== myReaction && (
                            <>
                              {partnerReaction === 'heart' && <Heart className="w-3 h-3 text-accent fill-current" />}
                              {partnerReaction === 'like' && <ThumbsUp className="w-3 h-3 text-blue-400" />}
                              {partnerReaction === 'star' && <Star className="w-3 h-3 text-yellow-400 fill-current" />}
                            </>
                          )}
                        </span>
                      )}
                    </div>
                  )}

                  {showReactionPicker === message.id && (
                    <div className={cn(
                      'absolute z-10 flex flex-col gap-1',
                      isSent ? 'right-0 -top-10' : 'left-0 -top-10'
                    )}>
                      <div className={cn(
                        'flex gap-1 bg-card border rounded-full px-2 py-1 shadow-lg',
                        isSent ? 'right-0' : 'left-0'
                      )}>
                        {QUICK_REACTIONS.map((r) => {
                          const Icon = r.icon;
                          const isActive = myReaction === r.id;
                          return (
                            <button
                              key={r.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleReaction(message.id, r.id);
                              }}
                              className={cn(
                                'p-1.5 rounded-full transition-transform hover:scale-110',
                                isActive && 'bg-accent/20'
                              )}
                              data-testid={`reaction-${r.id}-${message.id}`}
                            >
                              <Icon className={cn('w-4 h-4', r.color, isActive && 'fill-current')} />
                            </button>
                          );
                        })}
                      </div>
                      {!isSent && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenSaveDetail(message);
                          }}
                          className="flex items-center gap-1.5 bg-card border rounded-full px-3 py-1.5 shadow-lg text-xs hover:bg-accent/10 whitespace-nowrap"
                          data-testid={`save-detail-${message.id}`}
                        >
                          <FileText className="w-3.5 h-3.5" />
                          Save as detail about you
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {isPartnerTyping && (
            <div className="flex justify-start">
              <div className="flex items-center gap-1 px-4 py-2">
                <span className="w-1.5 h-1.5 bg-sage rounded-full animate-bounce" />
                <span className="w-1.5 h-1.5 bg-sage rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                <span className="w-1.5 h-1.5 bg-sage rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex-shrink-0 border-t bg-card/50 p-4">
        <div className="max-w-3xl mx-auto flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            className="hidden"
            data-testid="input-image-file"
          />
          {isRecording ? (
            <button
              onClick={handleVoiceClick}
              className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-md bg-destructive/20 text-destructive hover:bg-destructive/30"
              data-testid="button-voice-note"
              type="button"
              title="Tap to stop recording"
            >
              <MicOff className="w-5 h-5" />
            </button>
          ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                disabled={sending || isVideoRecordingActive}
                className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-md hover:bg-accent/10 disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="button-attach-menu"
                type="button"
                title="Attach or record"
              >
                <Plus className="w-5 h-5 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-48">
              <DropdownMenuItem
                onClick={handleImageClick}
                disabled={sending || isRecording || isVideoRecordingActive}
                data-testid="menu-item-image"
              >
                <Image className="w-4 h-4 mr-2" />
                Photo
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleVoiceClick}
                disabled={sending || isVideoRecordingActive}
                data-testid="menu-item-voice"
              >
                <Mic className="w-4 h-4 mr-2" />
                Voice note
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleVideoClick}
                disabled={sending || isRecording || isVideoRecordingActive}
                data-testid="menu-item-video"
              >
                <Video className="w-4 h-4 mr-2" />
                Video message
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setIsDisappearing(!isDisappearing)}
                disabled={sending || isRecording || isVideoRecordingActive}
                data-testid="menu-item-disappearing"
              >
                {isDisappearing ? (
                  <EyeOff className="w-4 h-4 mr-2 text-accent" />
                ) : (
                  <Eye className="w-4 h-4 mr-2" />
                )}
                {isDisappearing ? 'Disappearing: On' : 'Disappearing message'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          )}

          <div
            ref={messageInputRef}
            contentEditable={!sending}
            suppressContentEditableWarning
            role="textbox"
            aria-label="Message"
            data-placeholder="Type a message..."
            onInput={(e) => {
              const text = (e.target as HTMLDivElement).innerText || '';
              setNewMessage(text);
              handleTyping();
              adjustMessageInputHeight();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            onPaste={handlePaste}
            className={cn(
              "flex-1 min-h-10 max-h-40 resize-none overflow-y-auto py-2 px-3 rounded-md border border-input bg-background text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 md:text-sm",
              "[&:empty]:before:content-[attr(data-placeholder)] [&:empty]:before:text-muted-foreground"
            )}
            data-testid="input-message"
          />

          <Button
            onClick={handleSend}
            disabled={!newMessage.trim() || sending}
            size="icon"
            className="flex-shrink-0"
            data-testid="button-send"
            type="button"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {fullscreenImageMessageId && (
        <ImageFullscreenViewer
          mediaId={fullscreenImageMessageId}
          kind="message"
          alt="Message"
          onClose={() => setFullscreenImageMessageId(null)}
        />
      )}

      <Dialog open={videoDialogOpen} onOpenChange={(open) => !open && handleVideoDialogClose()}>
        <DialogContent className="max-w-md overflow-hidden p-0 gap-0" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={() => handleVideoDialogClose()}>
          <DialogHeader className="p-4 pb-2">
            <DialogTitle className="text-lg font-light">Video message</DialogTitle>
          </DialogHeader>
          {videoRecordingError && (
            <div className="px-4 py-2 text-sm text-destructive bg-destructive/10 mx-4 rounded-md">
              {videoRecordingError}
            </div>
          )}
          <div className="aspect-video w-full bg-black relative">
            {videoStage === 'review' && recordedBlobUrl ? (
              <video src={recordedBlobUrl} className="w-full h-full object-contain" playsInline controls />
            ) : (
              <video
                ref={previewVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
            )}
            {videoStage === 'recording' && (
              <div className="absolute top-2 left-2 flex items-center gap-2 px-2 py-1 rounded bg-black/60 text-white text-sm">
                <Circle className="w-3 h-3 fill-red-500 text-red-500" />
                <span>{Math.floor(recordingSeconds / 60)}:{(recordingSeconds % 60).toString().padStart(2, '0')}</span>
              </div>
            )}
          </div>
          <div className="p-4 space-y-3">
            {videoStage === 'preview' && (
              <>
                {videoDevices.length > 1 && (
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Camera</label>
                    <select
                      value={selectedVideoDeviceId}
                      onChange={(e) => handleVideoCameraChange(e.target.value)}
                      className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                      data-testid="select-video-camera"
                    >
                      {videoDevices.map((d) => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button type="button" onClick={handleStartVideoRecording} disabled={!!videoRecordingError || !streamForPreview} className="flex-1 gap-2" data-testid="button-video-start">
                    <Circle className="w-4 h-4 fill-current" />
                    Start recording
                  </Button>
                  <Button type="button" variant="outline" onClick={handleVideoDialogClose}>
                    Cancel
                  </Button>
                </div>
              </>
            )}
            {videoStage === 'recording' && (
              <Button type="button" variant="destructive" className="w-full gap-2" onClick={handleStopVideoRecording} data-testid="button-video-stop">
                <Square className="w-4 h-4 fill-current" />
                Stop recording
              </Button>
            )}
            {videoStage === 'review' && (
              <div className="flex gap-2">
                <Button type="button" onClick={handleVideoSend} disabled={sending} className="flex-1 gap-2" data-testid="button-video-send">
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Send
                </Button>
                <Button type="button" variant="outline" onClick={handleVideoRetry} disabled={sending} data-testid="button-video-retry">
                  Retry
                </Button>
                <Button type="button" variant="ghost" onClick={handleVideoDialogClose} disabled={sending}>
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={saveDetailMessage !== null} onOpenChange={(open) => { if (!open) { setSaveDetailMessage(null); setSaveDetailContent(''); setSaveDetailTag('remember'); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-light">Save as detail about you</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">Add this to Moments → Details. Only you see it.</p>
          <div className="space-y-4 mt-4">
            <div>
              <Label className="text-xs">Note</Label>
              <Input
                value={saveDetailContent}
                onChange={(e) => setSaveDetailContent(e.target.value)}
                placeholder="Context or note..."
                className="mt-1 min-h-[60px]"
                data-testid="input-save-detail-content"
              />
            </div>
            <div>
              <Label className="text-xs">Tag</Label>
              <Select value={saveDetailTag} onValueChange={(v) => setSaveDetailTag(v as PartnerDetailTag)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="remember">Remember</SelectItem>
                  <SelectItem value="important">Important</SelectItem>
                  <SelectItem value="follow-up">Follow-up</SelectItem>
                  <SelectItem value="funny">Funny</SelectItem>
                  <SelectItem value="sweet">Sweet</SelectItem>
                  <SelectItem value="to celebrate">To celebrate</SelectItem>
                  <SelectItem value="to avoid">To avoid</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleSaveDetail} disabled={!saveDetailContent.trim()} className="w-full" data-testid="button-save-detail-submit">
              Save to Moments → Details
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
