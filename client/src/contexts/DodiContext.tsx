import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { generatePassphrase, generateSalt, arrayBufferToBase64, base64ToArrayBuffer } from '@/lib/crypto';
import { saveSetting, getSetting, initDB, clearEncryptionCache, savePIN, verifyPIN } from '@/lib/storage-encrypted';
import { getTrialStatus } from '@/lib/storage-subscription';
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
  isTrialActive: boolean;
  trialDaysRemaining: number;
  isLocked: boolean;
  pinEnabled: boolean;
  showPinSetup: boolean;
  inactivityMinutes: number;
  initializeProfile: (displayName: string) => Promise<string>;
  initializePairing: () => Promise<{ userId: string; passphrase: string }>;
  completePairing: (partnerId: string, passphrase: string) => Promise<string>;
  completePairingWithMasterKey: (masterKey: string, salt: string, creatorId: string) => Promise<void>;
  completePairingAsCreator: (masterKey: string, salt: string, joinerId: string) => Promise<void>;
  setPartnerIdForCreator: (newPartnerId: string) => Promise<void>;
  onPeerConnected: () => void;
  setPIN: (pin: string) => Promise<void>;
  unlockWithPIN: (pin: string) => Promise<boolean>;
  unlockWithPassphrase: (passphrase: string) => Promise<boolean>;
  lockApp: () => void;
  setInactivityMinutes: (minutes: number) => Promise<void>;
  logout: () => Promise<void>;
}

const DodiContext = createContext<DodiContextType | undefined>(undefined);

export function DodiProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState<string | null>(null);
  const [pairingStatus, setPairingStatus] = useState<PairingStatus>('unpaired');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isTrialActive, setIsTrialActive] = useState(true);
  const [trialDaysRemaining, setTrialDaysRemaining] = useState(30);
  const [isLocked, setIsLocked] = useState(false);
  const [pinEnabled, setPinEnabled] = useState(false);
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [inactivityMinutes, setInactivityMinutesState] = useState(10);

  // Convenience getter
  const isPaired = pairingStatus === 'connected';

  useEffect(() => {
    const loadPairingData = async () => {
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

        if (storedUserId?.value) {
          setUserId(storedUserId.value);
          setDisplayName(storedDisplayName?.value || null);
        }

        if (storedPassphrase?.value) {
          setPassphrase(storedPassphrase.value);
        }

        if (storedPartnerId?.value) {
          setPartnerId(storedPartnerId.value);
        }

        // Restore pairing status from storage
        if (storedPairingStatus?.value) {
          const status = storedPairingStatus.value as PairingStatus;
          setPairingStatus(status);
          console.log('Restored pairing status:', status);
        } else if (storedUserId?.value && storedPassphrase?.value) {
          // Legacy: if we have userId + passphrase but no status, treat as waiting
          // This handles upgrades from old storage format
          if (storedPartnerId?.value) {
            // Has partner, so was connected (joiner flow)
            setPairingStatus('connected');
            await db.put('settings', { key: 'pairingStatus', value: 'connected' });
          } else {
            // No partner, creator waiting
            setPairingStatus('waiting');
            await db.put('settings', { key: 'pairingStatus', value: 'waiting' });
          }
        }

        // Restore PIN settings
        if (storedPinEnabled?.value === 'true' || storedPinEnabled?.value === true) {
          setPinEnabled(true);
          setIsLocked(true); // Lock on app load if PIN is enabled
        }

        if (storedInactivityMinutes?.value) {
          const minutes = typeof storedInactivityMinutes.value === 'string' 
            ? parseInt(storedInactivityMinutes.value, 10) 
            : storedInactivityMinutes.value;
          if (!isNaN(minutes)) {
            setInactivityMinutesState(minutes);
          }
        }

        const trialStatus = await getTrialStatus();
        setIsTrialActive(trialStatus.isActive);
        setTrialDaysRemaining(trialStatus.daysRemaining);
      } catch (error) {
        console.error('Failed to load pairing data:', error);
      }
    };

    const updateTrialStatus = async () => {
      try {
        const trialStatus = await getTrialStatus();
        setIsTrialActive(trialStatus.isActive);
        setTrialDaysRemaining(trialStatus.daysRemaining);
      } catch (error) {
        console.error('Failed to update trial status:', error);
      }
    };

    loadPairingData();

    const trialCheckInterval = setInterval(updateTrialStatus, 60000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        updateTrialStatus();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    window.addEventListener('online', () => setIsOnline(true));
    window.addEventListener('offline', () => setIsOnline(false));

    return () => {
      clearInterval(trialCheckInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', () => setIsOnline(true));
      window.removeEventListener('offline', () => setIsOnline(false));
    };
  }, []);

  // Called by creator when generating pairing credentials
  const initializePairing = async () => {
    const newUserId = nanoid();
    const newPassphrase = generatePassphrase();
    const saltBase64 = arrayBufferToBase64(generateSalt());
    
    await Promise.all([
      saveSetting('userId', newUserId),
      saveSetting('passphrase', newPassphrase),
      saveSetting('salt', saltBase64),
      saveSetting('pairingStatus', 'waiting'), // Creator is WAITING, not connected
    ]);
    
    setUserId(newUserId);
    setPassphrase(newPassphrase);
    setPartnerId(null);
    setPairingStatus('waiting'); // Stay on pairing page, show QR code
    
    console.log('Creator initialized - status: waiting, ready for partner to join');
    return { userId: newUserId, passphrase: newPassphrase };
  };

  // Called by joiner when they scan the creator's QR code
  // This stores credentials but keeps status as 'waiting' until P2P connection completes
  // Returns the joiner's userId for use in the answer QR
  const completePairing = async (newPartnerId: string, sharedPassphrase: string): Promise<string> => {
    if (!newPartnerId || !sharedPassphrase) {
      throw new Error('Partner ID and passphrase are required');
    }
    
    let currentUserId = userId;
    
    if (!currentUserId || currentUserId === newPartnerId) {
      do {
        currentUserId = nanoid();
      } while (currentUserId === newPartnerId);
      
      await saveSetting('userId', currentUserId);
      setUserId(currentUserId);
    }
    
    if (currentUserId === newPartnerId) {
      throw new Error('Cannot pair with yourself');
    }
    
    const db = await initDB();
    
    // Check if salt already exists, if not generate one
    const existingSalt = await db.get('settings', 'salt');
    if (!existingSalt) {
      const saltBase64 = arrayBufferToBase64(generateSalt());
      await db.put('settings', { key: 'salt', value: saltBase64 });
    }
    
    await db.put('settings', { key: 'partnerId', value: newPartnerId });
    await db.put('settings', { key: 'passphrase', value: sharedPassphrase });
    // Keep as 'waiting' until P2P connection is established
    await db.put('settings', { key: 'pairingStatus', value: 'waiting' });
    
    setPartnerId(newPartnerId);
    setPassphrase(sharedPassphrase);
    setPairingStatus('waiting'); // Joiner stays in waiting until P2P connects
    
    console.log('Joiner credentials stored - status: waiting for P2P connection');
    
    return currentUserId; // Return the joiner's userId for the answer QR
  };

  // Called by joiner when receiving master key via tunnel
  const completePairingWithMasterKey = async (masterKey: string, salt: string, remotePartnerId: string) => {
    if (!masterKey || !salt || !remotePartnerId) {
      throw new Error('Master key, salt, and remote partner ID are required');
    }
    
    // VALIDATION: Joiner must have their own userId already generated (from completePairing)
    if (!userId) {
      throw new Error('Joiner user ID must be generated before completing pairing');
    }
    
    // CRITICAL SAFETY CHECK: Prevent self-pairing - userId should NEVER match remotePartnerId
    if (userId === remotePartnerId) {
      throw new Error(`Self-pairing detected: Joiner ID (${userId}) matches Creator ID (${remotePartnerId}). Cannot proceed.`);
    }
    
    const db = await initDB();
    
    // NEVER modify userId - it was already generated and should remain unchanged
    // Only store the remote partner's ID and encryption credentials
    await db.put('settings', { key: 'passphrase', value: masterKey });
    await db.put('settings', { key: 'salt', value: salt });
    await db.put('settings', { key: 'partnerId', value: remotePartnerId });
    await db.put('settings', { key: 'pairingStatus', value: 'connected' });
    
    setPassphrase(masterKey);
    setPartnerId(remotePartnerId);
    setPairingStatus('connected');
    
    // Show PIN setup on successful pairing
    if (!pinEnabled) {
      setShowPinSetup(true);
    }
    
    console.log('📋 [ID AUDIT] Joiner pairing completed:', { myUserId: userId, partnerId: remotePartnerId, idUnchanged: true });
  };

  // Called by creator after receiving joiner's ID via tunnel ACK
  const completePairingAsCreator = async (masterKey: string, salt: string, remotePartnerId: string) => {
    if (!masterKey || !salt || !remotePartnerId) {
      throw new Error('Master key, salt, and remote partner ID are required');
    }
    
    // VALIDATION: Creator must have their own userId already generated (from initializePairing)
    if (!userId) {
      throw new Error('Creator user ID must be generated before completing pairing');
    }
    
    // CRITICAL SAFETY CHECK: Prevent self-pairing - userId should NEVER match remotePartnerId
    if (userId === remotePartnerId) {
      throw new Error(`Self-pairing detected: Creator ID (${userId}) matches Joiner ID (${remotePartnerId}). Cannot proceed.`);
    }
    
    const db = await initDB();
    
    // NEVER modify userId - it was already generated and should remain unchanged
    // Only store the remote partner's ID and encryption credentials
    await db.put('settings', { key: 'passphrase', value: masterKey });
    await db.put('settings', { key: 'salt', value: salt });
    await db.put('settings', { key: 'partnerId', value: remotePartnerId });
    await db.put('settings', { key: 'pairingStatus', value: 'connected' });
    
    setPassphrase(masterKey);
    setPartnerId(remotePartnerId);
    setPairingStatus('connected');
    
    // Show PIN setup on successful pairing
    if (!pinEnabled) {
      setShowPinSetup(true);
    }
    
    console.log('📋 [ID AUDIT] Creator pairing completed:', { myUserId: userId, partnerId: remotePartnerId, idUnchanged: true });
  };

  // Called by creator to set partner ID after joiner has joined
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
    console.log('Creator set partner ID:', newPartnerId);
  };

  // Called when P2P connection is established (for both creator and joiner)
  const onPeerConnected = useCallback(async () => {
    if (pairingStatus === 'waiting' || pairingStatus === 'unpaired') {
      console.log('P2P connection established - updating status to connected');
      setPairingStatus('connected');
      await saveSetting('pairingStatus', 'connected');
      
      // Show PIN setup on successful pairing
      if (!pinEnabled) {
        setShowPinSetup(true);
      }
    }
  }, [pairingStatus, pinEnabled]);

  // PIN Management Methods
  const setPINHandler = async (pin: string) => {
    if (pin.length < 4 || pin.length > 6) {
      throw new Error('PIN must be 4-6 digits');
    }
    await savePIN(pin);
    await saveSetting('pinEnabled', 'true');
    setPinEnabled(true);
    setShowPinSetup(false);
  };

  const unlockWithPINHandler = async (pin: string): Promise<boolean> => {
    try {
      const isValid = await verifyPIN(pin);
      if (isValid) {
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
  };

  const setInactivityMinutesHandler = async (minutes: number) => {
    setInactivityMinutesState(minutes);
    await saveSetting('inactivityMinutes', String(minutes));
  };

  // Inactivity timer hook
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
    setPassphrase(null);
    setPairingStatus('unpaired');
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
        isTrialActive,
        trialDaysRemaining,
        isLocked,
        pinEnabled,
        showPinSetup,
        inactivityMinutes,
        initializeProfile,
        initializePairing,
        completePairing,
        completePairingWithMasterKey,
        completePairingAsCreator,
        setPartnerIdForCreator,
        onPeerConnected,
        setPIN: setPINHandler,
        unlockWithPIN: unlockWithPINHandler,
        unlockWithPassphrase: unlockWithPassphraseHandler,
        lockApp: lockAppHandler,
        setInactivityMinutes: setInactivityMinutesHandler,
        logout,
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
