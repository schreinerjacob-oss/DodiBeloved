import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { generatePassphrase, generateSalt, deriveKey, arrayBufferToBase64 } from '@/lib/crypto';
import { saveSetting, getSetting, initDB, clearEncryptionCache } from '@/lib/storage-encrypted';
import { getTrialStatus } from '@/lib/storage-subscription';
import { nanoid } from 'nanoid';
import SimplePeer from 'simple-peer';

interface DodiContextType {
  userId: string | null;
  displayName: string | null;
  partnerId: string | null;
  passphrase: string | null;
  isPaired: boolean;
  isOnline: boolean;
  isTrialActive: boolean;
  trialDaysRemaining: number;
  isConnected: boolean;
  initializeProfile: (displayName: string) => Promise<string>;
  initializePairing: () => Promise<{ userId: string; passphrase: string; offer?: string }>;
  completePairing: (partnerId: string, passphrase: string, offer?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const DodiContext = createContext<DodiContextType | undefined>(undefined);

export function DodiProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState<string | null>(null);
  const [isPaired, setIsPaired] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isTrialActive, setIsTrialActive] = useState(true);
  const [trialDaysRemaining, setTrialDaysRemaining] = useState(30);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const loadPairingData = async () => {
      try {
        const db = await initDB();
        const [storedUserId, storedDisplayName, storedPartnerId, storedPassphrase] = await Promise.all([
          db.get('settings', 'userId'),
          db.get('settings', 'displayName'),
          db.get('settings', 'partnerId'),
          db.get('settings', 'passphrase'),
        ]);

        if (storedUserId?.value) {
          setUserId(storedUserId.value);
          setDisplayName(storedDisplayName?.value || null);
        }

        // Paired = has userId + passphrase (creator waiting for partner, or joiner connected)
        if (storedUserId?.value && storedPassphrase?.value) {
          setPassphrase(storedPassphrase.value);
          setIsPaired(true);
          
          // If there's a partnerId, also set it
          if (storedPartnerId?.value) {
            setPartnerId(storedPartnerId.value);
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

  const initializePairing = async () => {
    const newUserId = nanoid();
    const newPassphrase = generatePassphrase();
    const saltBase64 = arrayBufferToBase64(generateSalt());
    
    await Promise.all([
      saveSetting('userId', newUserId),
      saveSetting('passphrase', newPassphrase),
      saveSetting('salt', saltBase64),
    ]);
    
    setUserId(newUserId);
    setPassphrase(newPassphrase);
    setPartnerId(null);
    // DO NOT set isPaired yet - creator stays on pairing page to show QR code
    
    // Start WebRTC peer in initiator mode
    let offer = '';
    try {
      const peer = new SimplePeer({ initiator: true, trickle: false });
      offer = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Offer timeout')), 5000);
        peer.on('signal', (data) => {
          clearTimeout(timeout);
          resolve(btoa(JSON.stringify(data)));
        });
        peer.on('error', reject);
      });
      await saveSetting('peerOffer', offer);
      console.log('Creator: WebRTC offer generated and stored');
    } catch (e) {
      console.error('Error creating offer:', e);
    }
    
    return { userId: newUserId, passphrase: newPassphrase, offer };
  };

  const completePairing = async (newPartnerId: string, sharedPassphrase: string, offer?: string) => {
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
    
    setPartnerId(newPartnerId);
    setPassphrase(sharedPassphrase);
    setIsPaired(true);
    
    // Accept offer and create answer if offer provided
    if (offer) {
      try {
        const peer = new SimplePeer({ initiator: false, trickle: false });
        const answer = await new Promise<string>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Answer timeout')), 5000);
          peer.on('signal', (data) => {
            clearTimeout(timeout);
            resolve(btoa(JSON.stringify(data)));
          });
          peer.on('error', reject);
          peer.signal(JSON.parse(atob(offer)));
        });
        await saveSetting('peerAnswer', answer);
        setIsConnected(true);
        console.log('Joiner: WebRTC answer generated, P2P connected');
      } catch (e) {
        console.error('Error accepting offer:', e);
      }
    }
  };

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
    setIsPaired(false);
  };

  return (
    <DodiContext.Provider
      value={{
        userId,
        displayName,
        partnerId,
        passphrase,
        isPaired,
        isOnline,
        isTrialActive,
        trialDaysRemaining,
        isConnected,
        initializeProfile,
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
