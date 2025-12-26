import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { generatePassphrase, generateSalt, arrayBufferToBase64, base64ToArrayBuffer } from '@/lib/crypto';
import { saveSetting, getSetting, initDB, clearEncryptionCache, savePIN, verifyPIN } from '@/lib/storage-encrypted';
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
  isLoading: boolean;
  pinEnabled: boolean;
  showPinSetup: boolean;
  inactivityMinutes: number;
  allowWakeUp: boolean;
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
  const [isLoading, setIsLoading] = useState(true);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState<string | null>(null);
  const [pairingStatus, setPairingStatus] = useState<PairingStatus>('unpaired');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isLocked, setIsLocked] = useState(false);
  const [pinEnabled, setPinEnabled] = useState(false);
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [inactivityMinutes, setInactivityMinutesState] = useState(10);

  // Convenience getter
  const isPaired = pairingStatus === 'connected';

  useEffect(() => {
    const loadPairingData = async () => {
      setIsLoading(true);
      try {
        const db = await initDB();
        const [storedUserId, storedDisplayName, storedPartnerId, storedPassphrase, storedPairingStatus, storedPinEnabled, storedInactivityMinutes] = await Promise.all([
          db.get('settings', 'userId'),
          db.get('settings', 'displayName'),
          db.get('settings', 'partnerId'),
          db.get('settings', 'passphrase'),
          db.get('settings', 'pairingStatus'),
          db.get('settings', 'pinEnabled'),
          db.get('settings', 'inactivityMinutes'),
        ]);

        console.log('📦 [DodiContext] Loading stored data:', {
          userId: storedUserId?.value,
          partnerId: storedPartnerId?.value,
          pairingStatus: storedPairingStatus?.value
        });

        if (storedUserId?.value) {
          setUserId(storedUserId.value);
          setDisplayName(storedDisplayName?.value || null);
        }

        if (storedPassphrase?.value) {
          if (storedPinEnabled?.value === 'true' || storedPinEnabled?.value === true) {
            setPassphrase(null);
          } else {
            setPassphrase(storedPassphrase.value);
          }
        }

        if (storedPartnerId?.value) {
          setPartnerId(storedPartnerId.value);
        }

        if (storedPairingStatus?.value) {
          const status = storedPairingStatus.value as PairingStatus;
          setPairingStatus(status);
          console.log('Restored pairing status:', status);
        } else if (storedUserId?.value && storedPassphrase?.value) {
          if (storedPartnerId?.value) {
            setPairingStatus('connected');
            await db.put('settings', { key: 'pairingStatus', value: 'connected' });
          } else {
            setPairingStatus('waiting');
            await db.put('settings', { key: 'pairingStatus', value: 'waiting' });
          }
        }

        if (storedPinEnabled?.value === 'true' || storedPinEnabled?.value === true) {
          setPinEnabled(true);
          setIsLocked(true);
        }

        if (storedInactivityMinutes?.value) {
          const minutes = typeof storedInactivityMinutes.value === 'string' 
            ? parseInt(storedInactivityMinutes.value, 10) 
            : storedInactivityMinutes.value;
          if (!isNaN(minutes)) {
            setInactivityMinutesState(minutes);
          }
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
    
    console.log('🎭 [CREATOR INIT] Creator pairing initialized');
    return { userId: userId, passphrase: newPassphrase };
  };

  const completePairingWithMasterKey = async (masterKey: string, salt: string, remotePartnerId: string) => {
    if (!masterKey || !salt || !remotePartnerId) {
      throw new Error('Master key, salt, and remote partner ID are required');
    }
    
    if (!userId) {
      throw new Error('Joiner user ID must be generated before completing pairing');
    }
    
    if (userId === remotePartnerId) {
      throw new Error(`Self-pairing detected: Joiner ID (${userId}) matches Creator ID (${remotePartnerId}). Cannot proceed.`);
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
    
    if (!userId) {
      throw new Error('Creator user ID must be generated before completing pairing');
    }
    
    if (userId === remotePartnerId) {
      throw new Error(`Self-pairing detected: Creator ID (${userId}) matches Joiner ID (${remotePartnerId}). Cannot proceed.`);
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
    if (!newPartnerId) {
      throw new Error('Partner ID is required');
    }
    
    if (newPartnerId === userId) {
      throw new Error('Cannot pair with yourself');
    }
    
    const db = await initDB();
    await db.put('settings', { key: 'partnerId', value: newPartnerId });
    
    setPartnerId(newPartnerId);
  };

  const onPeerConnected = useCallback(async () => {
    if (pairingStatus === 'waiting' || pairingStatus === 'unpaired') {
      setPairingStatus('connected');
      await saveSetting('pairingStatus', 'connected');
      
      if (!pinEnabled) {
        setShowPinSetup(true);
      }
    }
  }, [pairingStatus, pinEnabled]);

  const setPINHandler = async (pin: string) => {
    if (pin.length < 4 || pin.length > 6) {
      throw new Error('PIN must be 4-6 digits');
    }
    
    if (!passphrase) {
      throw new Error('Passphrase not available to encrypt');
    }
    
    const { savePIN } = await import('@/lib/storage-encrypted');
    await savePIN(pin, passphrase);
    
    await saveSetting('pinEnabled', 'true');
    setPinEnabled(true);
    setShowPinSetup(false);
  };

  const skipPINSetupHandler = () => {
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
      console.error('PIN verification error:', error);
      return false;
    }
  };

  const unlockWithPassphraseHandler = async (pass: string): Promise<boolean> => {
    try {
      if (pass === passphrase) {
        setIsLocked(false);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Passphrase verification error:', error);
      return false;
    }
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
    enabled: pinEnabled && pairingStatus === 'connected',
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
    await db.clear('settings');
    await db.clear('messages');
    await db.clear('memories');
    await db.clear('calendarEvents');
    await db.clear('dailyRituals');
    await db.clear('loveLetters');
    await db.clear('reactions');
    
    setUserId(null);
    setDisplayName(null);
    setPartnerId(null);
    setPairingStatus('unpaired');
  };

  const [allowWakeUp, setAllowWakeUpState] = useState(false);

  useEffect(() => {
    const loadAllowWakeUp = async () => {
      const db = await initDB();
      const stored = await db.get('settings', 'allowWakeUp');
      if (stored) {
        setAllowWakeUpState(stored.value === 'true' || stored.value === true);
      }
    };
    loadAllowWakeUp();
  }, []);

  const setAllowWakeUp = async (enabled: boolean) => {
    setAllowWakeUpState(enabled);
    await saveSetting('allowWakeUp', enabled ? 'true' : 'false');
  };

  return (
    <DodiContext.Provider
      value={{
        userId,
        displayName,
        partnerId,
        passphrase,
        pairingStatus,
        isPaired,
        isOnline,
        isLocked,
        pinEnabled,
        showPinSetup,
        inactivityMinutes,
        allowWakeUp,
        setAllowWakeUp,
        initializeProfile,
        initializePairing,
        completePairingWithMasterKey,
        completePairingAsCreator,
        setPartnerIdForCreator,
        onPeerConnected,
        setPIN: setPINHandler,
        skipPINSetup: skipPINSetupHandler,
        unlockWithPIN: unlockWithPINHandler,
        unlockWithPassphrase: unlockWithPassphraseHandler,
        lockApp: lockAppHandler,
        setInactivityMinutes: setInactivityMinutesHandler,
        logout,
        isLoading,
      }}
    >
      {children}
    </DodiContext.Provider>
  );
}

export function useDodi() {
  const context = useContext(DodiContext);
  if (!context) {
    throw new Error('useDodi must be used within a DodiProvider');
  }
  return context;
}
