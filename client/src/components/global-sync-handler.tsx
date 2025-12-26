import { useEffect } from 'react';
import { useDodi } from '@/contexts/DodiContext';
import { usePeerConnection } from '@/hooks/use-peer-connection';
import { saveMemory, saveCalendarEvent, saveDailyRitual, saveLoveLetter, savePrayer, saveReaction } from '@/lib/storage-encrypted';
import { notifyNewMemory, notifyCalendarEvent, notifyDailyRitual, notifyNewLoveLetter } from '@/lib/notifications';
import type { SyncMessage, Memory, CalendarEvent, DailyRitual, LoveLetter, Prayer, Reaction } from '@/types';

export function GlobalSyncHandler() {
  const { userId, partnerId } = useDodi();
  const { state: peerState } = usePeerConnection();

  useEffect(() => {
    if (!peerState.connected || !partnerId || !userId) return;

    const handleP2pMessage = async (event: CustomEvent) => {
      try {
        const message: SyncMessage = event.detail;
        
        // Handle memory sync
        if (message.type === 'memory') {
          const incomingMemory = message.data as Memory;
          const isOurMemory = (incomingMemory.userId === userId && incomingMemory.partnerId === partnerId) ||
                             (incomingMemory.userId === partnerId && incomingMemory.partnerId === userId);
          
          if (isOurMemory) {
            console.log('📸 [SYNC] Received memory:', incomingMemory.id);
            
            // If mediaUrl is ArrayBuffer (binary image data), convert to Blob and save
            if (incomingMemory.mediaUrl && typeof incomingMemory.mediaUrl === 'object' && (incomingMemory.mediaUrl as unknown) instanceof ArrayBuffer) {
              const { saveMediaBlob } = await import('@/lib/storage');
              const blob = new Blob([incomingMemory.mediaUrl], { type: 'image/jpeg' });
              await saveMediaBlob(incomingMemory.id, blob, 'memory');
              incomingMemory.mediaUrl = null;
            }
            
            await saveMemory(incomingMemory);
            console.log('✅ [SYNC] Memory saved:', incomingMemory.id);
            
            // Notify if app in background
            notifyNewMemory();
            
            // Dispatch event for UI updates
            window.dispatchEvent(new CustomEvent('memory-synced', { detail: incomingMemory }));
          }
        }
        
        // Handle calendar event sync
        if (message.type === 'calendar_event') {
          const event = message.data as CalendarEvent;
          console.log('📅 [SYNC] Received calendar event:', event.id);
          await saveCalendarEvent(event);
          notifyCalendarEvent();
          window.dispatchEvent(new CustomEvent('calendar-synced', { detail: event }));
        }
        
        // Handle daily ritual sync
        if (message.type === 'daily_ritual') {
          const ritual = message.data as DailyRitual;
          console.log('✨ [SYNC] Received daily ritual:', ritual.id);
          await saveDailyRitual(ritual);
          notifyDailyRitual();
          window.dispatchEvent(new CustomEvent('ritual-synced', { detail: ritual }));
        }
        
        // Handle love letter sync
        if (message.type === 'love_letter') {
          const letter = message.data as LoveLetter;
          console.log('💌 [SYNC] Received love letter:', letter.id);
          await saveLoveLetter(letter);
          notifyNewLoveLetter();
          window.dispatchEvent(new CustomEvent('letter-synced', { detail: letter }));
        }
        
        // Handle prayer sync
        if (message.type === 'prayer') {
          const prayer = message.data as Prayer;
          console.log('🙏 [SYNC] Received prayer:', prayer.id);
          await savePrayer(prayer);
          window.dispatchEvent(new CustomEvent('prayer-synced', { detail: prayer }));
        }
        
        // Handle reaction sync
        if (message.type === 'reaction') {
          const reaction = message.data as Reaction;
          console.log('💖 [SYNC] Received reaction:', reaction.id);
          await saveReaction(reaction);
          window.dispatchEvent(new CustomEvent('reaction-synced', { detail: reaction }));
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
