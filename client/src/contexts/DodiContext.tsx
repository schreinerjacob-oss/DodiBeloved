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
  const [isLocked, setIsLocked] = useState(() => {
    try {
      return localStorage.getItem('dodi-pinEnabled') === 'true';
    } catch {
      return false;
    }
  });
  const [pinEnabled, setPinEnabled] = useState(() => {
    try {
      return localStorage.getItem('dodi-pinEnabled') === 'true';
    } catch {
      return false;
    }
  });
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [inactivityMinutes, setInactivityMinutesState] = useState(10);
  const [isPremium, setIsPremium] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [allowWakeUp, setAllowWakeUpState] = useState(false);

  const isPaired = pairingStatus === 'connected';

  useEffect(() => {
    const loadPairingData = async () => {
      setIsLoading(true);
      try {
        const [
          storedUserId,
          storedDisplayName,
          storedPartnerId,
          storedPassphrase,
          storedPairingStatus,
          storedPinEnabled,
          storedInactivityMinutes,
          storedIsPremium,
          storedAllowWakeUp,
          storedSalt
        ] = await Promise.all([
          getSetting('userId'),
          getSetting('displayName'),
          getSetting('partnerId'),
          getSetting('passphrase'),
          getSetting('pairingStatus'),
          getSetting('pinEnabled'),
          getSetting('inactivityMinutes'),
          getSetting('isPremium'),
          getSetting('allowWakeUp'),
          getSetting('salt')
        ]);

        if (storedUserId) setUserId(storedUserId);
        if (storedDisplayName) setDisplayName(storedDisplayName);
        if (storedPartnerId) setPartnerId(storedPartnerId);
        
        if (storedPairingStatus) {
          setPairingStatus(storedPairingStatus as PairingStatus);
        }

        if (storedPinEnabled === 'true') {
          console.log('🔐 [CONTEXT] App is PIN enabled, locking...');
          setPinEnabled(true);
          setIsLocked(true);
          // If locked, we don't set the passphrase in memory until unlocked
          setPassphrase(null);
        } else if (storedPassphrase) {
          console.log('🔑 [CONTEXT] Found passphrase, app unlocked');
          setPassphrase(storedPassphrase);
        }

        if (storedAllowWakeUp === 'true') {
          setAllowWakeUpState(true);
        }

        if (storedInactivityMinutes) {
          const minutes = parseInt(String(storedInactivityMinutes), 10);
          if (!isNaN(minutes)) setInactivityMinutesState(minutes);
        }

        if (storedIsPremium === 'true') {
          setIsPremium(true);
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
    try {
      if (!passphrase) throw new Error('Passphrase not available');
      const { savePIN } = await import('@/lib/storage-encrypted');
      await savePIN(pin, passphrase);
      await saveSetting('pinEnabled', 'true');
      setPinEnabled(true);
      setShowPinSetup(false);
    } catch (error: any) {
      console.error('PIN setup failed:', error);
      throw new Error(error.message || 'Failed to set up PIN');
    }
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
    // Explicitly set in localStorage for immediate recovery
    localStorage.setItem('dodi-userId', newUserId);
    localStorage.setItem('dodi-displayName', name);
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
