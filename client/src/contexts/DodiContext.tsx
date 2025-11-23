import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { generatePassphrase, generateSalt, deriveKey, arrayBufferToBase64 } from '@/lib/crypto';
import { saveSetting, getSetting, initDB } from '@/lib/storage';
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
        await initDB();
        const storedUserId = await getSetting('userId');
        const storedPartnerId = await getSetting('partnerId');
        const storedPassphrase = await getSetting('passphrase');

        console.log('Loaded pairing data:', { userId: !!storedUserId, partnerId: !!storedPartnerId, passphrase: !!storedPassphrase });

        if (storedUserId && storedPartnerId && storedPassphrase) {
          setUserId(storedUserId);
          setPartnerId(storedPartnerId);
          setPassphrase(storedPassphrase);
          setIsPaired(true);
          console.log('Pairing restored successfully');
        }

        const trialStatus = await getTrialStatus();
        setIsTrialActive(trialStatus.isActive);
        setTrialDaysRemaining(trialStatus.daysRemaining);
      } catch (error) {
        console.error('Error loading pairing data:', error);
      }
    };

    loadPairingData();

    const handleOnline = () => {
      setIsOnline(true);
      console.log('Device online');
    };
    const handleOffline = () => {
      setIsOnline(false);
      console.log('Device offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const initializePairing = async () => {
    const newUserId = nanoid();
    const newPassphrase = generatePassphrase();
    
    const salt = generateSalt();
    const saltBase64 = arrayBufferToBase64(salt);
    
    await saveSetting('userId', newUserId);
    await saveSetting('passphrase', newPassphrase);
    await saveSetting('salt', saltBase64);
    
    setUserId(newUserId);
    setPassphrase(newPassphrase);
    
    return { userId: newUserId, passphrase: newPassphrase };
  };

  const completePairing = async (newPartnerId: string, sharedPassphrase: string) => {
    console.log('completePairing called with:', { newPartnerId, currentUserId: userId });
    
    // If joining (no userId yet), create one
    let currentUserId = userId;
    if (!currentUserId) {
      currentUserId = nanoid();
      await saveSetting('userId', currentUserId);
      setUserId(currentUserId);
      console.log('Created new userId for joining user:', currentUserId);
    }
    
    console.log('Saving pairing:', { myUserId: currentUserId, partnerId: newPartnerId, areDifferent: currentUserId !== newPartnerId });
    
    // Ensure partnerId is different from our userId
    if (currentUserId === newPartnerId) {
      throw new Error('Partner ID cannot be the same as your ID');
    }
    
    await saveSetting('partnerId', newPartnerId);
    await saveSetting('passphrase', sharedPassphrase);
    
    setPartnerId(newPartnerId);
    setPassphrase(sharedPassphrase);
    setIsPaired(true);

    // Notify partner that we've completed pairing
    setTimeout(() => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);
      
      ws.onopen = () => {
        console.log('Notifying partner of pairing completion');
        ws.send(JSON.stringify({
          type: 'register',
          data: { userId: currentUserId },
        }));
        
        ws.send(JSON.stringify({
          type: 'partner-joined',
          data: { partnerId: newPartnerId, joinedUserId: currentUserId },
        }));
        
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
