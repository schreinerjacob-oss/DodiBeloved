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
        const db = await initDB();
        const storedUserId = await db.get('settings', 'userId');
        const storedPartnerId = await db.get('settings', 'partnerId');
        const storedPassphrase = await db.get('settings', 'passphrase');

        console.log('Loaded pairing data:', { 
          userId: storedUserId?.value, 
          partnerId: storedPartnerId?.value, 
          hasPassphrase: !!storedPassphrase?.value 
        });

        if (storedUserId?.value && storedPartnerId?.value && storedPassphrase?.value) {
          setUserId(storedUserId.value);
          setPartnerId(storedPartnerId.value);
          setPassphrase(storedPassphrase.value);
          setIsPaired(true);
          console.log('Pairing restored successfully');
        } else if (storedUserId?.value) {
          // User created pairing but not joined yet
          setUserId(storedUserId.value);
          setPassphrase(storedPassphrase?.value || null);
          setPartnerId(null);
          console.log('Unpaired user loaded');
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
    
    console.log('initializePairing: Creating new user:', newUserId);
    
    await saveSetting('userId', newUserId);
    await saveSetting('passphrase', newPassphrase);
    await saveSetting('salt', saltBase64);
    // Clear any old partner data when creating new pairing
    await saveSetting('partnerId', '');
    
    setUserId(newUserId);
    setPassphrase(newPassphrase);
    setPartnerId(null);
    
    console.log('initializePairing complete:', { userId: newUserId });
    
    return { userId: newUserId, passphrase: newPassphrase };
  };

  const completePairing = async (newPartnerId: string, sharedPassphrase: string) => {
    console.log('completePairing called with:', { newPartnerId, currentUserId: userId, sharedPassphrase });
    
    // Always create a new userId for the joining user
    // This ensures each device has a unique ID
    let currentUserId = userId;
    
    // If this is a join operation (userId is null OR we're explicitly joining with a different partner)
    // create a fresh userId
    if (!currentUserId || currentUserId === newPartnerId) {
      const oldUserId = currentUserId;
      currentUserId = nanoid();
      console.log('Creating new userId for join:', { oldUserId, newUserId: currentUserId });
      await saveSetting('userId', currentUserId);
      setUserId(currentUserId);
    }
    
    console.log('Final pairing setup:', { 
      myUserId: currentUserId, 
      partnerId: newPartnerId, 
      areEqual: currentUserId === newPartnerId,
      passphrase: sharedPassphrase 
    });
    
    // Final safety check
    if (currentUserId === newPartnerId) {
      throw new Error(`Cannot pair with yourself. Your ID: ${currentUserId}, Partner ID: ${newPartnerId}`);
    }
    
    // Save the partnerId and shared passphrase - wait for DB to confirm
    const db = await initDB();
    await db.put('settings', { key: 'partnerId', value: newPartnerId });
    await db.put('settings', { key: 'passphrase', value: sharedPassphrase });
    
    // Verify the save succeeded
    const saved = await db.get('settings', 'partnerId');
    console.log('Verified partnerId saved:', saved);
    
    // Update context state
    setPartnerId(newPartnerId);
    setPassphrase(sharedPassphrase);
    setIsPaired(true);
    
    console.log('Pairing saved and verified successfully');

    // Notify partner that we've completed pairing
    setTimeout(() => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);
      
      ws.onopen = () => {
        console.log('Notifying partner of pairing completion:', { myUserId: currentUserId, theirUserId: newPartnerId });
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
