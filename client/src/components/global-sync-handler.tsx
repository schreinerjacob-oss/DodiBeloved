import { useEffect } from 'react';
import { useDodi } from '@/contexts/DodiContext';
import { usePeerConnection } from '@/hooks/use-peer-connection';
import { saveMemory, deleteMemory, saveCalendarEvent, saveDailyRitual, saveLoveLetter, savePrayer, saveReaction } from '@/lib/storage-encrypted';
import { notifyNewMemory, notifyCalendarEvent, notifyDailyRitual, notifyNewLoveLetter, notifyNewMessage } from '@/lib/notifications';
import type { SyncMessage, Memory, CalendarEvent, DailyRitual, LoveLetter, Prayer, Reaction } from '@/types';

export function GlobalSyncHandler() {
  const { userId, partnerId } = useDodi();
  const { state: peerState } = usePeerConnection();

  const toMillis = (value: unknown): number => {
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const asNum = Number(value);
      if (Number.isFinite(asNum)) return asNum;
      const asDate = Date.parse(value);
      if (Number.isFinite(asDate)) return asDate;
    }
    return 0;
  };

  useEffect(() => {
    if (!peerState.connected || !partnerId || !userId) return;

    const handleP2pMessage = async (event: any) => {
      try {
        const message: SyncMessage = event.detail;
        const { setLastSynced, saveMemory, saveCalendarEvent, saveDailyRitual, saveLoveLetter, savePrayer, saveReaction } = await import('@/lib/storage-encrypted');
        
        // Handle memory sync. Metadata is saved first; media arrives separately via media channel and dodi-media-ready.
        if (message.type === 'memory') {
          const incomingMemory = message.data as Memory;
          const isOurMemory = (incomingMemory.userId === userId && incomingMemory.partnerId === partnerId) ||
                             (incomingMemory.userId === partnerId && incomingMemory.partnerId === userId);
          
          if (isOurMemory) {
            console.log('📸 [SYNC] Received memory:', incomingMemory.id);
            
            // Backward-compat: older builds may embed media in memory.mediaUrl (dataURL or ArrayBuffer)
            if (incomingMemory.mediaUrl) {
              try {
                const { saveMediaBlob } = await import('@/lib/storage');
                if (typeof incomingMemory.mediaUrl === 'string' && incomingMemory.mediaUrl.startsWith('data:image')) {
                  const response = await fetch(incomingMemory.mediaUrl);
                  const blob = await response.blob();
                  await saveMediaBlob(incomingMemory.id, blob, 'memory');
                  window.dispatchEvent(new CustomEvent('dodi-media-ready', { detail: { mediaId: incomingMemory.id, kind: 'memory' } }));
                } else if (incomingMemory.mediaUrl instanceof ArrayBuffer) {
                  const blob = new Blob([incomingMemory.mediaUrl], { type: 'image/jpeg' });
                  await saveMediaBlob(incomingMemory.id, blob, 'memory');
                  window.dispatchEvent(new CustomEvent('dodi-media-ready', { detail: { mediaId: incomingMemory.id, kind: 'memory' } }));
                }
              } catch (e) {
                console.error('❌ [SYNC] Failed to process incoming media:', e);
              } finally {
                // New path uses separate media channel; memory.mediaUrl should be null in storage
                (incomingMemory as any).mediaUrl = null;
              }
            }
            
            await saveMemory(incomingMemory);
            await setLastSynced('memories', toMillis(incomingMemory.timestamp));
            console.log('✅ [SYNC] Memory saved:', incomingMemory.id);
            
            // Notify if app in background
            notifyNewMemory();
            
            // Dispatch event for UI updates
            window.dispatchEvent(new CustomEvent('memory-synced', { detail: incomingMemory }));
          }
        }

        // Handle memory update (e.g. caption edit); validate pair, save and notify UI
        if (message.type === 'memory-update') {
          const updatedMemory = message.data as Memory;
          const isOurMemory =
            updatedMemory &&
            ((updatedMemory.userId === userId && updatedMemory.partnerId === partnerId) ||
              (updatedMemory.userId === partnerId && updatedMemory.partnerId === userId));
          if (isOurMemory && updatedMemory.id) {
            try {
              await saveMemory(updatedMemory);
              window.dispatchEvent(new CustomEvent('memory-updated', { detail: updatedMemory }));
            } catch (e) {
              console.warn('Failed to save memory on memory-update:', e);
            }
          }
        }

        // Handle memory delete (either partner can delete; validate pair via userId/partnerId in payload)
        if (message.type === 'memory-delete') {
          const { memoryId, userId: payloadUserId, partnerId: payloadPartnerId } = (message.data as { memoryId: string; userId?: string; partnerId?: string }) || {};
          const isOurPair =
            payloadUserId !== undefined &&
            payloadPartnerId !== undefined &&
            ((payloadUserId === userId && payloadPartnerId === partnerId) || (payloadUserId === partnerId && payloadPartnerId === userId));
          if (memoryId && isOurPair) {
            try {
              await deleteMemory(memoryId);
              window.dispatchEvent(new CustomEvent('memory-deleted', { detail: { memoryId } }));
            } catch (e) {
              console.warn('Failed to delete memory on memory-delete:', e);
            }
          }
        }
        
        // Handle calendar event sync
        if (message.type === 'calendar_event') {
          const event = message.data as CalendarEvent;
          console.log('📅 [SYNC] Received calendar event:', event.id);
          await saveCalendarEvent(event);
          // Keep reconciliation timestamps accurate so moments backfill works on reconnect
          await setLastSynced('calendarEvents', toMillis((event as any).eventDate ?? (event as any).createdAt));
          notifyCalendarEvent();
          window.dispatchEvent(new CustomEvent('calendar-synced', { detail: event }));
        }
        
        // Handle daily ritual sync
        if (message.type === 'daily_ritual') {
          const ritual = message.data as DailyRitual;
          console.log('✨ [SYNC] Received daily ritual:', ritual.id);
          await saveDailyRitual(ritual);
          notifyDailyRitual();
          window.dispatchEvent(new CustomEvent('p2p-message', { detail: message }));
        }
        
        // Handle love letter sync
        if (message.type === 'love_letter') {
          const letter = message.data as LoveLetter;
          console.log('💌 [SYNC] Received love letter:', letter.id);
          await saveLoveLetter(letter);
          if ((letter as any).timestamp) {
            await setLastSynced('letters', Number((letter as any).timestamp));
          }
          notifyNewLoveLetter();
          window.dispatchEvent(new CustomEvent('p2p-message', { detail: message }));
        }
        
        // Handle prayer sync
        if (message.type === 'prayer') {
          const prayer = message.data as Prayer;
          console.log('🙏 [SYNC] Received prayer:', prayer.id);
          await savePrayer(prayer);
          if ((prayer as any).timestamp) {
            await setLastSynced('prayers', Number((prayer as any).timestamp));
          }
          window.dispatchEvent(new CustomEvent('p2p-message', { detail: message }));
        }
        
        // Handle reaction sync
        if (message.type === 'reaction') {
          const reaction = message.data as Reaction;
          console.log('💖 [SYNC] Received reaction:', reaction.id);
          await saveReaction(reaction);
          window.dispatchEvent(new CustomEvent('reaction-synced', { detail: reaction }));
        }

        // Handle chat messages (if not explicitly handled by page)
        if (message.type === 'chat' || message.type === 'message') {
           const chatMsg = message.data as any;
           const { saveMessage } = await import('@/lib/storage-encrypted');
           
           // Notify before saving to avoid race conditions with background sync
           notifyNewMessage();
           
           await saveMessage(chatMsg);
           await setLastSynced('chat', toMillis(chatMsg.timestamp));
           window.dispatchEvent(new CustomEvent('chat-message-received', { detail: chatMsg }));
        }
        
      } catch (e) {
        console.error('❌ [SYNC] Error handling sync message:', e);
      }
    };

    window.addEventListener('p2p-message', handleP2pMessage as unknown as EventListener);
    console.log('🔄 [SYNC] Global sync handler activated');
    
    return () => {
      window.removeEventListener('p2p-message', handleP2pMessage as unknown as EventListener);
    };
  }, [peerState.connected, partnerId, userId]);

  return null;
}
