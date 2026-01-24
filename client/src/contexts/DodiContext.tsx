import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { generatePassphrase, generateSalt, arrayBufferToBase64 } from '@/lib/crypto';
import { saveSetting, getSetting, initDB, clearEncryptionCache } from '@/lib/storage-encrypted';
import { useInactivityTimer } from '@/hooks/use-inactivity-timer';
import { nanoid } from 'nanoid';

type PairingStatus = 'unpaired' | 'waiting' | 'connected';

interface DodiContextType {
  userId: string | null;
  displayName: string | null;
  partnerId: string | null;
  passphrase: string | null;
  pairingStatus: PairingStatus;
  isPaired: boolean;
  isOnline: boolean;
  isLocked: boolean;
  pinEnabled: boolean;
  showPinSetup: boolean;
  inactivityMinutes: number;
  allowWakeUp: boolean;
  isPremium: boolean;
  hasPIN: boolean;
  setPremiumStatus: (status: boolean) => Promise<void>;
  setAllowWakeUp: (enabled: boolean) => Promise<void>;
  initializeProfile: (displayName: string) => Promise<string>;
  initializePairing: () => Promise<{ userId: string; passphrase: string }>;
  completePairingWithMasterKey: (masterKey: string, salt: string, creatorId: string) => Promise<void>;
  completePairingAsCreator: (masterKey: string, salt: string, joinerId: string) => Promise<void>;
  setPartnerIdForCreator: (newPartnerId: string) => Promise<void>;
  onPeerConnected: () => void;
  setPIN: (pin: string) => Promise<void>;
  skipPINSetup: () => void;
  unlockWithPIN: (pin: string) => Promise<boolean>;
  unlockWithPassphrase: (passphrase: string) => Promise<boolean>;
  lockApp: () => void;
  setInactivityMinutes: (minutes: number) => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
}

const DodiContext = createContext<DodiContextType | undefined>(undefined);

export function DodiProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState<string | null>(null);
  const [pairingStatus, setPairingStatus] = useState<PairingStatus>('unpaired');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isLocked, setIsLocked] = useState(false);
  const [pinEnabled, setPinEnabled] = useState(false);
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [inactivityMinutes, setInactivityMinutesState] = useState(10);
  const [isPremium, setIsPremium] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const isPaired = pairingStatus === 'connected';

  useEffect(() => {
    const loadPairingData = async () => {
      setIsLoading(true);
      try {
        const db = await initDB();
        const [storedUserId, storedDisplayName, storedPartnerId, storedPassphrase, storedPairingStatus, storedPinEnabled, storedInactivityMinutes, storedIsPremium, storedAllowWakeUp] = await Promise.all([
          db.get('settings', 'userId'),
          db.get('settings', 'displayName'),
          db.get('settings', 'partnerId'),
          db.get('settings', 'passphrase'),
          db.get('settings', 'pairingStatus'),
          db.get('settings', 'pinEnabled'),
          db.get('settings', 'inactivityMinutes'),
          db.get('settings', 'isPremium'),
          db.get('settings', 'allowWakeUp'),
        ]);

        const storedUserIdObj = storedUserId as any;
        if (storedUserIdObj?.value) {
          setUserId(storedUserIdObj.value);
          const storedDisplayNameObj = storedDisplayName as any;
          setDisplayName(storedDisplayNameObj?.value || null);
        }

        const storedPassphraseObj = storedPassphrase as any;
        if (storedPassphraseObj?.value) {
          setPassphrase(storedPassphraseObj.value);
        }

        const storedPartnerIdObj = storedPartnerId as any;
        if (storedPartnerIdObj?.value) {
          setPartnerId(storedPartnerIdObj.value);
        }

        const storedPairingStatusObj = storedPairingStatus as any;
        if (storedPairingStatusObj?.value) {
          setPairingStatus(storedPairingStatusObj.value as PairingStatus);
        }

        const storedPinEnabledObjFinal = storedPinEnabled as any;
        if (storedPinEnabledObjFinal?.value === 'true' || storedPinEnabledObjFinal?.value === true) {
          setPinEnabled(true);
          // If PIN is enabled, we lock the app and clear the in-memory passphrase
          // The user will need to enter PIN to decrypt the passphrase back into memory
          setIsLocked(true);
          setPassphrase(null);
        }

        const storedAllowWakeUpObj = storedAllowWakeUp as any;
        if (storedAllowWakeUpObj?.value) {
          setAllowWakeUpState(storedAllowWakeUpObj.value === 'true' || storedAllowWakeUpObj.value === true);
        }

        const storedInactivityMinutesObj = storedInactivityMinutes as any;
        if (storedInactivityMinutesObj?.value) {
          const minutes = typeof storedInactivityMinutesObj.value === 'string' 
            ? parseInt(storedInactivityMinutesObj.value, 10) 
            : storedInactivityMinutesObj.value as number;
          if (!isNaN(minutes)) {
            setInactivityMinutesState(minutes);
          }
        }

        const storedIsPremiumObj = storedIsPremium as any;
        if (storedIsPremiumObj?.value) {
          setIsPremium(storedIsPremiumObj.value === 'true' || storedIsPremiumObj.value === true);
        }
        
        // Ensure userId is correctly set from storage
        if (storedUserIdObj?.value) {
          setUserId(storedUserIdObj.value);
        }
      } catch (error) {
        console.error('Failed to load pairing data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadPairingData();

    window.addEventListener('online', () => setIsOnline(true));
    window.addEventListener('offline', () => setIsOnline(false));

    return () => {
      window.removeEventListener('online', () => setIsOnline(true));
      window.removeEventListener('offline', () => setIsOnline(false));
    };
  }, []);

  const initializePairing = async () => {
    if (!userId) {
      throw new Error('User profile must be initialized before starting pairing');
    }
    
    const newPassphrase = generatePassphrase();
    const saltBase64 = arrayBufferToBase64(generateSalt());
    
    await Promise.all([
      saveSetting('passphrase', newPassphrase),
      saveSetting('salt', saltBase64),
      saveSetting('pairingStatus', 'waiting'),
    ]);
    
    setPassphrase(newPassphrase);
    setPartnerId(null);
    setPairingStatus('waiting');
    
    return { userId: userId, passphrase: newPassphrase };
  };

  const completePairingWithMasterKey = async (masterKey: string, salt: string, remotePartnerId: string) => {
    if (!masterKey || !salt || !remotePartnerId) {
      throw new Error('Master key, salt, and remote partner ID are required');
    }
    
    const db = await initDB();
    await db.put('settings', { key: 'passphrase', value: masterKey });
    await db.put('settings', { key: 'salt', value: salt });
    await db.put('settings', { key: 'partnerId', value: remotePartnerId });
    await db.put('settings', { key: 'pairingStatus', value: 'connected' });
    
    setPassphrase(masterKey);
    setPartnerId(remotePartnerId);
    setPairingStatus('connected');
    
    if (!pinEnabled) {
      setShowPinSetup(true);
    }
  };

  const completePairingAsCreator = async (masterKey: string, salt: string, remotePartnerId: string) => {
    if (!masterKey || !salt || !remotePartnerId) {
      throw new Error('Master key, salt, and remote partner ID are required');
    }
    
    const db = await initDB();
    await db.put('settings', { key: 'passphrase', value: masterKey });
    await db.put('settings', { key: 'salt', value: salt });
    await db.put('settings', { key: 'partnerId', value: remotePartnerId });
    await db.put('settings', { key: 'pairingStatus', value: 'connected' });
    
    setPassphrase(masterKey);
    setPartnerId(remotePartnerId);
    setPairingStatus('connected');
    
    if (!pinEnabled) {
      setShowPinSetup(true);
    }
  };

  const setPartnerIdForCreator = async (newPartnerId: string) => {
    if (!newPartnerId) throw new Error('Partner ID is required');
    const db = await initDB();
    await db.put('settings', { key: 'partnerId', value: newPartnerId });
    setPartnerId(newPartnerId);
  };

  const onPeerConnected = useCallback(async () => {
    if (pairingStatus === 'waiting' || pairingStatus === 'unpaired') {
      setPairingStatus('connected');
      await saveSetting('pairingStatus', 'connected');
      if (!pinEnabled) setShowPinSetup(true);
    }
  }, [pairingStatus, pinEnabled]);

  const setPINHandler = async (pin: string) => {
    if (!passphrase) throw new Error('Passphrase not available');
    const { savePIN } = await import('@/lib/storage-encrypted');
    await savePIN(pin, passphrase);
    await saveSetting('pinEnabled', 'true');
    setPinEnabled(true);
    setShowPinSetup(false);
  };

  const unlockWithPINHandler = async (pin: string): Promise<boolean> => {
    try {
      const { verifyPINAndGetPassphrase } = await import('@/lib/storage-encrypted');
      const decryptedPassphrase = await verifyPINAndGetPassphrase(pin);
      if (decryptedPassphrase) {
        setPassphrase(decryptedPassphrase);
        setIsLocked(false);
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  };

  const unlockWithPassphraseHandler = async (pass: string): Promise<boolean> => {
    if (pass === passphrase) {
      setIsLocked(false);
      return true;
    }
    return false;
  };

  const lockAppHandler = () => {
    setIsLocked(true);
    setPassphrase(null);
  };

  const setInactivityMinutesHandler = async (minutes: number) => {
    setInactivityMinutesState(minutes);
    await saveSetting('inactivityMinutes', String(minutes));
  };

  useInactivityTimer({
    onInactivity: lockAppHandler,
    timeoutMinutes: inactivityMinutes,
    enabled: pinEnabled && pairingStatus === 'connected' && !isLocked,
  });

  const initializeProfile = async (name: string) => {
    const newUserId = nanoid();
    await saveSetting('userId', newUserId);
    await saveSetting('displayName', name);
    setUserId(newUserId);
    setDisplayName(name);
    return newUserId;
  };

  const logout = async () => {
    clearEncryptionCache();
    setPassphrase(null);
    const db = await initDB();
    await Promise.all(['settings', 'messages', 'memories', 'calendarEvents', 'dailyRituals', 'loveLetters', 'reactions'].map(s => db.clear(s)));
    setUserId(null);
    setDisplayName(null);
    setPartnerId(null);
    setPairingStatus('unpaired');
  };

  const [allowWakeUp, setAllowWakeUpState] = useState(false);

  const setAllowWakeUp = async (enabled: boolean) => {
    setAllowWakeUpState(enabled);
    await saveSetting('allowWakeUp', enabled ? 'true' : 'false');
  };

  const setPremiumStatus = async (status: boolean) => {
    setIsPremium(status);
    await saveSetting('isPremium', status ? 'true' : 'false');
  };

  return (
    <DodiContext.Provider
      value={{
        userId, displayName, partnerId, passphrase, pairingStatus, isPaired, isOnline,
        isLocked, pinEnabled, showPinSetup, inactivityMinutes, allowWakeUp, isPremium,
        hasPIN: pinEnabled,
        setAllowWakeUp, setPremiumStatus, initializeProfile, initializePairing, completePairingWithMasterKey,
        completePairingAsCreator, setPartnerIdForCreator, onPeerConnected,
        setPIN: setPINHandler, skipPINSetup: () => setShowPinSetup(false),
        unlockWithPIN: unlockWithPINHandler, unlockWithPassphrase: unlockWithPassphraseHandler,
        lockApp: lockAppHandler, setInactivityMinutes: setInactivityMinutesHandler, logout, isLoading,
      }}
    >
      {children}
    </DodiContext.Provider>
  );
}

export function useDodi() {
  const context = useContext(DodiContext);
  if (!context) throw new Error('useDodi must be used within a DodiProvider');
  return context;
}
