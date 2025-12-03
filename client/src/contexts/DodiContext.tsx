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

        // SECURITY: If PIN is enabled, don't auto-unlock
        // Passphrase is locked behind PIN UI until unlocked
        if (storedPassphrase?.value) {
          if (storedPinEnabled?.value === 'true' || storedPinEnabled?.value === true) {
            // PIN is enabled - require unlock to access passphrase
            setPassphrase(null);
          } else {
            // PIN not enabled - can load passphrase normally (legacy or newly paired)
            setPassphrase(storedPassphrase.value);
          }
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
  // IMPORTANT: Uses the EXISTING userId from initializeProfile - does NOT generate a new one
  const initializePairing = async () => {
    if (!userId) {
      throw new Error('User profile must be initialized before starting pairing');
    }
    
    const newPassphrase = generatePassphrase();
    const saltBase64 = arrayBufferToBase64(generateSalt());
    
    await Promise.all([
      saveSetting('passphrase', newPassphrase),
      saveSetting('salt', saltBase64),
      saveSetting('pairingStatus', 'waiting'), // Creator is WAITING, not connected
    ]);
    
    // CRITICAL: Do NOT modify userId - it was already set by initializeProfile()
    setPassphrase(newPassphrase);
    setPartnerId(null);
    setPairingStatus('waiting'); // Stay on pairing page, show QR code
    
    console.log('🎭 [CREATOR INIT] Creator pairing initialized');
    console.log('   MY DEVICE ID:', userId);
    console.log('   Master key salt:', saltBase64.substring(0, 8) + '...');
    return { userId: userId, passphrase: newPassphrase };
  };

  // Called by joiner when receiving master key via tunnel
  const completePairingWithMasterKey = async (masterKey: string, salt: string, remotePartnerId: string) => {
    if (!masterKey || !salt || !remotePartnerId) {
      throw new Error('Master key, salt, and remote partner ID are required');
    }
    
    // VALIDATION: Joiner must have their own userId already generated
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
    
    console.log('✅ [JOINER COMPLETE] Pairing successful!');
    console.log('   MY DEVICE ID:', userId);
    console.log('   PARTNER DEVICE ID:', remotePartnerId);
    console.log('   Master key:', masterKey.substring(0, 8) + '...');
    console.log('═══ CROSSOVER VERIFICATION ═══');
    console.log('   Device B stores Device A:', remotePartnerId);
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
    
    console.log('✅ [CREATOR COMPLETE] Pairing successful!');
    console.log('   MY DEVICE ID:', userId);
    console.log('   PARTNER DEVICE ID:', remotePartnerId);
    console.log('   Master key:', masterKey.substring(0, 8) + '...');
    console.log('═══ CROSSOVER VERIFICATION ═══');
    console.log('   Device A stores Device B:', remotePartnerId);
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

  // PIN Management Methods - KEY WRAPPING
  const setPINHandler = async (pin: string) => {
    if (pin.length < 4 || pin.length > 6) {
      throw new Error('PIN must be 4-6 digits');
    }
    
    // KEY WRAPPING: Encrypt passphrase with PIN, delete plaintext
    if (!passphrase) {
      throw new Error('Passphrase not available to encrypt');
    }
    
    const { savePIN } = await import('@/lib/storage-encrypted');
    await savePIN(pin, passphrase);
    
    await saveSetting('pinEnabled', 'true');
    setPinEnabled(true);
    setShowPinSetup(false);
    
    console.log('✅ [PIN] PIN set, passphrase encrypted and stored in RAM only');
  };

  const skipPINSetupHandler = () => {
    setShowPinSetup(false);
    console.log('⏭️ [PIN] PIN setup skipped');
  };

  const unlockWithPINHandler = async (pin: string): Promise<boolean> => {
    try {
      // KEY WRAPPING: Decrypt passphrase with PIN
      const { verifyPINAndGetPassphrase } = await import('@/lib/storage-encrypted');
      const decryptedPassphrase = await verifyPINAndGetPassphrase(pin);
      
      if (decryptedPassphrase) {
        setPassphrase(decryptedPassphrase); // Load to RAM
        setIsLocked(false);
        console.log('✅ [PIN] Unlocked, passphrase decrypted to RAM');
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
    // SECURITY: Clear passphrase from RAM when locking
    // On page reload, passphrase is null until user enters PIN again
    setPassphrase(null);
    console.log('🔒 [LOCK] Passphrase cleared from RAM');
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
    
    console.log('✅ [DEVICE INIT] Device userId created:', newUserId);
    return newUserId;
  };

  const logout = async () => {
    clearEncryptionCache();
    setPassphrase(null); // SECURITY: Clear passphrase from RAM
    
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
