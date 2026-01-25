import { useEffect, useCallback } from 'react';
import { useDodi } from '@/contexts/DodiContext';
import { useToast } from '@/hooks/use-toast';

/**
 * Global listener for dodi-restore-payload (P2P restore-key).
 * Handles restore when user is already in main app (e.g. Chat), not on PairingPage.
 * Pairing tunnel restore is still handled in pairing.tsx via runJoinerTunnel.
 */
export function DodiRestoreListener() {
  const {
    userId,
    completePairingWithMasterKey,
    completePairingAsCreator,
    onPeerConnected,
  } = useDodi();
  const { toast } = useToast();

  const handleRestorePayload = useCallback(
    async (e: CustomEvent) => {
      const payload = e.detail;
      if (!payload?.masterKey || !payload?.salt) return;
      if (!userId) {
        console.warn('♾️ [RESTORE] Ignoring restore payload: no userId');
        return;
      }

      console.log('♾️ [RESTORE] Processing restoration payload (global listener):', payload);

      try {
        if (payload.essentials) {
          console.log('♾️ [RESTORE] Applying essential data...');
          const { saveIncomingItems } = await import('@/lib/storage-encrypted');
          const stores = Object.keys(payload.essentials);
          for (const store of stores) {
            const items = payload.essentials[store];
            if (items?.length) await saveIncomingItems(store as any, items);
          }
          console.log('✅ [RESTORE] Essentials applied');
          toast({
            title: 'Core restored ♾️',
            description: 'Older items will sync in the background.',
          });
        }

        const isCreatorRole = userId === payload.creatorId;

        if (isCreatorRole) {
          if (!payload.joinerId) throw new Error('Joiner ID not received in tunnel');
          if (userId === payload.joinerId) throw new Error('Self-pairing detected');
          await completePairingAsCreator(payload.masterKey, payload.salt, payload.joinerId);
        } else {
          if (!payload.creatorId) throw new Error('Creator ID not received in tunnel');
          if (userId === payload.creatorId) throw new Error('Self-pairing detected');
          await completePairingWithMasterKey(payload.masterKey, payload.salt, payload.creatorId);
        }

        onPeerConnected();

        const { saveSetting } = await import('@/lib/storage');
        await saveSetting('passphrase', payload.masterKey);
        await saveSetting('salt', payload.salt);
        await saveSetting('partnerId', isCreatorRole ? payload.joinerId : payload.creatorId);
        await saveSetting('pairingStatus', 'connected');
        localStorage.setItem('dodi-passphrase', payload.masterKey);
        localStorage.setItem('dodi-salt', payload.salt);
        localStorage.setItem('dodi-partnerId', isCreatorRole ? payload.joinerId : payload.creatorId);
        localStorage.setItem('dodi-pairingStatus', 'connected');

        toast({
          title: 'Restore complete ♾️',
          description: 'Your connection has been updated.',
        });
      } catch (err) {
        console.error('❌ [RESTORE] Global restore failed:', err);
        toast({
          title: 'Restore failed',
          description: err instanceof Error ? err.message : 'Could not apply restoration.',
          variant: 'destructive',
        });
      }
    },
    [
      userId,
      completePairingWithMasterKey,
      completePairingAsCreator,
      onPeerConnected,
      toast,
    ]
  );

  useEffect(() => {
    const handler = (e: Event) => handleRestorePayload(e as CustomEvent);
    window.addEventListener('dodi-restore-payload', handler);
    return () => window.removeEventListener('dodi-restore-payload', handler);
  }, [handleRestorePayload]);

  return null;
}
