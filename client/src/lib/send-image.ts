/**
 * Shared "send image from File" API for Chat and Memories.
 * Validates type/size, creates record, saves preview (and optional full) via storage,
 * sends metadata via P2P, sends media via sendMedia.
 * Reusable from Flutter/native bridge (e.g. pass base64 or file path; bridge turns it into File and calls this).
 */

import { nanoid } from 'nanoid';
import type { Message, Memory } from '@/types';
import type { SyncMessage } from '@/types';
import { compressImage, compressImageWithPreset } from '@/lib/utils';

const DISAPPEAR_MS = 30_000;
const MAX_IMAGE_SIZE = 25 * 1024 * 1024;

export type SendImageKind = 'message' | 'memory';

export interface SendImageFromFileOptions {
  kind: SendImageKind;
  isDisappearing?: boolean;
  caption?: string;
}

export interface SendImageFromFileContext {
  userId: string;
  partnerId: string;
  connected: boolean;
  sendP2P: (msg: SyncMessage) => void;
  sendMedia: (args: { mediaId: string; kind: SendImageKind; mime: string; variant?: 'preview' | 'full'; blob?: Blob }) => Promise<void>;
  saveMediaBlob: (id: string, blob: Blob, kind: SendImageKind, variant: 'preview' | 'full') => Promise<void>;
  getSetting: (key: string) => Promise<string | undefined>;
  toast: (opts: { title: string; description?: string; variant?: 'default' | 'destructive' }) => void;
  saveMessage?: (m: Message) => Promise<void>;
  saveMemory?: (m: Memory) => Promise<void>;
  onMessageCreated?: (m: Message) => void;
  onMemoryCreated?: (m: Memory) => void;
  onDisappearingTimer?: (messageId: string, deleteAt: number, deleteCb: () => void) => void;
  deleteMessage?: (id: string) => Promise<void>;
}

/**
 * Send an image from a File: create record, save preview/full, send P2P + media.
 * Returns the message or memory id, or null on validation/error.
 */
export async function sendImageFromFile(
  file: File,
  options: SendImageFromFileOptions,
  context: SendImageFromFileContext
): Promise<string | null> {
  const { kind, isDisappearing, caption } = options;
  const { userId, partnerId, connected, sendP2P, sendMedia, saveMediaBlob, getSetting, toast } = context;

  if (!file.type.startsWith('image/')) {
    toast({ title: 'Not an image', description: 'Please choose a photo or GIF.', variant: 'destructive' });
    return null;
  }
  if (file.size > MAX_IMAGE_SIZE) {
    toast({ title: 'Image too large', description: 'Please choose an image under 25MB.', variant: 'destructive' });
    return null;
  }

  const id = nanoid();
  const displayName = file.name || `image.${(file.type.split('/')[1] || 'jpeg')}`;
  const isGif = file.type === 'image/gif';
  const now = new Date();
  const isOffline = !connected;

  try {
    const imageSendMode = (await getSetting('imageSendMode')) || 'balanced';
    let previewBlob: Blob;
    if (isGif) {
      previewBlob = file;
    } else {
      const preset = imageSendMode === 'aggressive' ? 'aggressive' : 'balanced';
      previewBlob = await compressImageWithPreset(file, preset);
    }
    await saveMediaBlob(id, previewBlob, kind, 'preview');

    if (kind === 'message') {
      const saveMessage = context.saveMessage;
      if (!saveMessage) {
        toast({ title: 'Cannot send', variant: 'destructive' });
        return null;
      }
      const disappearsAt = isDisappearing ? new Date(Date.now() + DISAPPEAR_MS) : undefined;
      const message: Message = {
        id,
        senderId: userId,
        recipientId: partnerId,
        content: displayName,
        type: 'image',
        mediaUrl: null,
        isDisappearing: isDisappearing ?? undefined,
        disappearsAt: disappearsAt ?? undefined,
        timestamp: now,
        status: isOffline ? 'queued' : 'sending',
      };
      await saveMessage(message);
      context.onMessageCreated?.(message);

      sendP2P({ type: 'message', data: { ...message, mediaUrl: null }, timestamp: Date.now() });
      await sendMedia({ mediaId: id, kind: 'message', mime: previewBlob.type || file.type || 'image/jpeg' });

      if (!isGif && (imageSendMode === 'balanced' || imageSendMode === 'full') && file.size !== previewBlob.size) {
        const trySendFull = async () => {
          try {
            await saveMediaBlob(id, file, 'message', 'full');
            await sendMedia({ mediaId: id, kind: 'message', mime: file.type || 'image/jpeg', variant: 'full', blob: file });
          } catch {
            const fallback = await compressImage(file, 960, 0.5);
            await saveMediaBlob(id, fallback, 'message', 'full');
            await sendMedia({ mediaId: id, kind: 'message', mime: 'image/jpeg', variant: 'full', blob: fallback });
          }
        };
        void trySendFull().catch((err) => {
          console.warn('🖼️ [MEDIA] Full-quality send failed:', err);
          toast({ title: 'Full-quality sync delayed', description: 'Will send when connection is stable.' });
        });
      }

      toast({ title: isOffline ? 'Image queued' : 'Image sending' });

      if (isDisappearing && context.onDisappearingTimer && context.deleteMessage) {
        context.onDisappearingTimer(id, Date.now() + DISAPPEAR_MS, () => {
          context.deleteMessage!(id).catch(() => {});
          sendP2P({ type: 'message-delete', data: { messageId: id }, timestamp: Date.now() });
        });
      }
      return id;
    }

    // kind === 'memory'
    const saveMemory = context.saveMemory;
    if (!saveMemory) {
      toast({ title: 'Cannot save memory', variant: 'destructive' });
      return null;
    }
    const memory: Memory = {
      id,
      userId,
      partnerId,
      imageData: '',
      mediaUrl: null,
      caption: (caption ?? '').trim() || null,
      mediaType: 'photo',
      timestamp: now,
      createdAt: now,
    };
    await saveMemory(memory);
    context.onMemoryCreated?.(memory);

    sendP2P({ type: 'memory', data: { ...memory, mediaUrl: null, imageData: '' }, timestamp: Date.now() });
    await sendMedia({ mediaId: id, kind: 'memory', mime: previewBlob.type || file.type || 'image/jpeg' });

    if ((imageSendMode === 'balanced' || imageSendMode === 'full') && file.size !== previewBlob.size) {
      const trySendFull = async () => {
        try {
          await saveMediaBlob(id, file, 'memory', 'full');
          await sendMedia({ mediaId: id, kind: 'memory', mime: file.type || 'image/jpeg', variant: 'full', blob: file });
        } catch {
          const fallback = await compressImage(file, 960, 0.5);
          await saveMediaBlob(id, fallback, 'memory', 'full');
          await sendMedia({ mediaId: id, kind: 'memory', mime: 'image/jpeg', variant: 'full', blob: fallback });
        }
      };
      void trySendFull().catch((err) => {
        console.warn('🖼️ [MEDIA] Full-quality send failed:', err);
        toast({ title: 'Full-quality sync delayed', description: 'Will send when connection is stable.' });
      });
    }

    toast({ title: 'Memory saved 📸', description: 'Your precious moment is preserved and shared.' });
    return id;
  } catch (error) {
    console.error('sendImageFromFile error:', error);
    toast({
      title: kind === 'message' ? "Image didn't send" : "Memory didn't save",
      description: "Try again when you're back online.",
      variant: 'destructive',
    });
    return null;
  }
}
