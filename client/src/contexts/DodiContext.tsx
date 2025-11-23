import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { generatePassphrase, generateSalt, deriveKey, arrayBufferToBase64 } from '@/lib/crypto';
import { saveSetting, getSetting, initDB } from '@/lib/storage-encrypted';
import { getTrialStatus } from '@/lib/storage-subscription';
import { nanoid } from 'nanoid';

interface DodiContextType {
  userId: string | null;
  partnerId: string | null;
  passphrase: string | null;
  isPaired: boolean;
  isOnline: boolean;
  isTrialActive: boolean;
  trialDaysRemaining: number;
  initializePairing: () => Promise<{ userId: string; passphrase: string }>;
  completePairing: (partnerId: string, passphrase: string) => Promise<void>;
  logout: () => Promise<void>;
}

const DodiContext = createContext<DodiContextType | undefined>(undefined);

export function DodiProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState<string | null>(null);
  const [isPaired, setIsPaired] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isTrialActive, setIsTrialActive] = useState(true);
  const [trialDaysRemaining, setTrialDaysRemaining] = useState(30);

  useEffect(() => {
    const loadPairingData = async () => {
      try {
        const db = await initDB();
        const [storedUserId, storedPartnerId, storedPassphrase] = await Promise.all([
          db.get('settings', 'userId'),
          db.get('settings', 'partnerId'),
          db.get('settings', 'passphrase'),
        ]);

        if (storedUserId?.value && storedPartnerId?.value && storedPassphrase?.value) {
          setUserId(storedUserId.value);
          setPartnerId(storedPartnerId.value);
          setPassphrase(storedPassphrase.value);
          setIsPaired(true);
        } else if (storedUserId?.value) {
          setUserId(storedUserId.value);
          setPassphrase(storedPassphrase?.value || null);
          setPartnerId(null);
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

  const initializePairing = async () => {
    const newUserId = nanoid();
    const newPassphrase = generatePassphrase();
    const saltBase64 = arrayBufferToBase64(generateSalt());
    
    await Promise.all([
      saveSetting('userId', newUserId),
      saveSetting('passphrase', newPassphrase),
      saveSetting('salt', saltBase64),
      saveSetting('partnerId', ''),
    ]);
    
    setUserId(newUserId);
    setPassphrase(newPassphrase);
    setPartnerId(null);
    
    return { userId: newUserId, passphrase: newPassphrase };
  };

  const completePairing = async (newPartnerId: string, sharedPassphrase: string) => {
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
    await db.put('settings', { key: 'partnerId', value: newPartnerId });
    await db.put('settings', { key: 'passphrase', value: sharedPassphrase });
    
    setPartnerId(newPartnerId);
    setPassphrase(sharedPassphrase);
    setIsPaired(true);

    setTimeout(() => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'register', data: { userId: currentUserId } }));
        ws.send(JSON.stringify({ type: 'partner-joined', data: { partnerId: newPartnerId, joinedUserId: currentUserId } }));
        ws.close();
      };
    }, 100);
  };

  const logout = async () => {
    const db = await initDB();
    await db.clear('settings');
    
    setUserId(null);
    setPartnerId(null);
    setPassphrase(null);
    setIsPaired(false);
  };

  return (
    <DodiContext.Provider
      value={{
        userId,
        partnerId,
        passphrase,
        isPaired,
        isOnline,
        isTrialActive,
        trialDaysRemaining,
        initializePairing,
        completePairing,
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
