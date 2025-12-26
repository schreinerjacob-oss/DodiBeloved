import { encrypt, decrypt, deriveKey, base64ToArrayBuffer } from '@/lib/crypto';
import { initDB as initDBRaw, getSetting as getSettingRaw, saveSetting as saveSettingRaw, saveMediaBlob, getMediaBlob, deleteMediaBlob, getMessages as getMessagesRaw, getMemories as getMemoriesRaw } from '@/lib/storage';
import type { Message, Memory, CalendarEvent, DailyRitual, LoveLetter, FutureLetter, Prayer, Reaction, EncryptedData } from '@/types';

let cachedKey: CryptoKey | null = null;
let cachedPINKey: CryptoKey | null = null;

export const initDB = initDBRaw;
export const getSetting = getSettingRaw;
export const saveSetting = saveSettingRaw;

// Properly decrypt messages when loading from storage
export async function getMessages(limit: number = 50, offset: number = 0): Promise<Message[]> {
  const db = await initDBRaw();
  const allEncrypted = await db.getAllFromIndex('messages', 'timestamp');
  const sorted = allEncrypted.sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
  const sliced = sorted.slice(Math.max(0, sorted.length - offset - limit), sorted.length - offset);
  return Promise.all(sliced.map(enc => decryptMessage(enc)));
}

// Properly decrypt memories when loading from storage
export async function getMemories(limit: number = 20, offset: number = 0): Promise<Memory[]> {
  const db = await initDBRaw();
  const allEncrypted = await db.getAllFromIndex('memories', 'timestamp');
  const sorted = allEncrypted.sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
  const sliced = sorted.slice(Math.max(0, sorted.length - offset - limit), sorted.length - offset);
  return Promise.all(sliced.map(enc => decryptMemory(enc)));
}

// Sync Tracking
export async function getLastSynced(category: string): Promise<number> {
  const db = await initDBRaw();
  const setting = await getSettingRaw(`lastSynced_${category}`);
  return setting ? Number(setting) : 0;
}

export async function setLastSynced(category: string, timestamp: number): Promise<void> {
  await saveSettingRaw(`lastSynced_${category}`, String(timestamp));
}

// REMOVED DUPLICATE getAllMessages

// REMOVED DUPLICATE getAllMemories

export async function getAllPrayers(): Promise<Prayer[]> {
  const db = await initDB();
  const allEncrypted = await db.getAll('loveLetters');
  const decrypted = await Promise.all(
    allEncrypted.map(async (enc) => {
      try {
        const dec = await decryptPrayer(enc);
        // Only return true prayers, not future letters
        if (dec && 'gratitude' in dec) {
          return dec as Prayer;
        }
        return null;
      } catch {
        return null;
      }
    })
  );
  return decrypted.filter((item): item is Prayer => item !== null);
}

export async function getAllLoveLetters(): Promise<LoveLetter[]> {
  const db = await initDB();
  const allEncrypted = await db.getAll('loveLetters');
  const decrypted = await Promise.all(
    allEncrypted.map(async (enc) => {
      try {
        const dec = await decryptLoveLetter(enc);
        // Only return true love letters, not prayers or future letters
        return dec && !('gratitude' in dec) && !('unlockDate' in dec) ? dec : null;
      } catch {
        return null;
      }
    })
  );
  return decrypted.filter((item): item is LoveLetter => item !== null);
}

export async function getEncryptionKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  
  const storedPassphrase = await getSettingRaw('passphrase');
  const storedSalt = await getSettingRaw('salt');

  if (!storedPassphrase || !storedSalt) {
    throw new Error('No encryption credentials available');
  }

  const salt = base64ToArrayBuffer(storedSalt);
  cachedKey = await deriveKey(storedPassphrase, salt);
  return cachedKey;
}

export function clearEncryptionCache(): void {
  cachedKey = null;
  cachedPINKey = null;
}

async function encryptObject<T>(obj: T): Promise<EncryptedData> {
  const key = await getEncryptionKey();
  const jsonStr = JSON.stringify(obj);
  return encrypt(jsonStr, key);
}

function dateReviver(_key: string, value: unknown): unknown {
  if (typeof value === 'string') {
    const dateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/;
    if (dateRegex.test(value)) {
      return new Date(value);
    }
  }
  return value;
}

async function decryptObject<T>(encrypted: EncryptedData): Promise<T> {
  const key = await getEncryptionKey();
  const jsonStr = await decrypt(encrypted, key);
  return JSON.parse(jsonStr, dateReviver) as T;
}

export async function encryptMessage(message: Message): Promise<EncryptedData> {
  return encryptObject(message);
}

export async function decryptMessage(encrypted: EncryptedData): Promise<Message> {
  return decryptObject(encrypted);
}

export async function encryptMemory(memory: Memory): Promise<EncryptedData> {
  return encryptObject(memory);
}

export async function decryptMemory(encrypted: EncryptedData): Promise<Memory> {
  return decryptObject(encrypted);
}

export async function encryptCalendarEvent(event: CalendarEvent): Promise<EncryptedData> {
  return encryptObject(event);
}

export async function decryptCalendarEvent(encrypted: EncryptedData): Promise<CalendarEvent> {
  return decryptObject(encrypted);
}

export async function encryptDailyRitual(ritual: DailyRitual): Promise<EncryptedData> {
  return encryptObject(ritual);
}

export async function decryptDailyRitual(encrypted: EncryptedData): Promise<DailyRitual> {
  return decryptObject(encrypted);
}

export async function encryptLoveLetter(letter: LoveLetter): Promise<EncryptedData> {
  return encryptObject(letter);
}

export async function decryptLoveLetter(encrypted: EncryptedData): Promise<LoveLetter> {
  return decryptObject(encrypted);
}

export async function encryptFutureLetter(letter: FutureLetter): Promise<EncryptedData> {
  return encryptObject(letter);
}

export async function decryptFutureLetter(encrypted: EncryptedData): Promise<FutureLetter> {
  return decryptObject(encrypted);
}

export async function encryptPrayer(prayer: Prayer): Promise<EncryptedData> {
  return encryptObject(prayer);
}

export async function decryptPrayer(encrypted: EncryptedData): Promise<Prayer> {
  return decryptObject(encrypted);
}

export async function encryptReaction(reaction: Reaction): Promise<EncryptedData> {
  return encryptObject(reaction);
}

export async function decryptReaction(encrypted: EncryptedData): Promise<Reaction> {
  return decryptObject(encrypted);
}

// PIN Management Functions - KEY WRAPPING
// Derives a key from PIN + salt for encrypting passphrase
async function derivePINKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  return deriveKey(pin, salt);
}

export async function savePIN(pin: string, passphrase: string): Promise<void> {
  try {
    const db = await initDB();
    const storedSalt = await getSettingRaw('salt');
    
    if (!storedSalt) {
      throw new Error('Salt not available');
    }

    // Safely decode salt with validation
    let salt: Uint8Array;
    try {
      salt = base64ToArrayBuffer(storedSalt);
    } catch (e) {
      console.error('Failed to decode salt:', e);
      throw new Error('Invalid salt format');
    }

    const pinKey = await derivePINKey(pin, salt);
    
    // Encrypt passphrase with PIN for verification
    const encryptedPassphrase = await encrypt(passphrase, pinKey);
    
    // Encrypt PIN for additional verification
    const mainKey = await getEncryptionKey();
    const encryptedPin = await encrypt(pin, mainKey);
    
    // SECURITY NOTE: Keep plaintext passphrase in storage for message decryption
    // The encryptedPassphrase serves as a tamper check - if PIN is correct, it decrypts to match stored passphrase
    await Promise.all([
      db.put('settings', { 
        key: 'encryptedPassphrase', 
        value: JSON.stringify(encryptedPassphrase)
      }),
      db.put('settings', { 
        key: 'pin', 
        value: JSON.stringify(encryptedPin)
      }),
      // NOTE: Do NOT delete plaintext passphrase - needed for getEncryptionKey() to decrypt messages
      // Security is provided by PIN lock UI + inactivity timeout
    ]);
    
    console.log('✅ [KEY WRAPPING] Passphrase encrypted with PIN, PIN setup complete');
  } catch (error) {
    console.error('Failed to save PIN:', error);
    throw error;
  }
}

export async function verifyPINAndGetPassphrase(pin: string): Promise<string | null> {
  try {
    const db = await initDB();
    const storedSalt = await getSettingRaw('salt');
    const storedEncryptedPassphrase = await db.get('settings', 'encryptedPassphrase');
    
    if (!storedSalt || !storedEncryptedPassphrase) {
      return null;
    }

    // Safely decode salt with validation
    let salt: Uint8Array;
    try {
      salt = base64ToArrayBuffer(storedSalt);
    } catch (e) {
      console.error('Failed to decode salt:', e);
      return null;
    }

    const pinKey = await derivePINKey(pin, salt);
    
    // Try to decrypt passphrase with PIN
    let encrypted: EncryptedData;
    try {
      encrypted = JSON.parse(storedEncryptedPassphrase.value as string);
    } catch (e) {
      console.error('Failed to parse encrypted passphrase:', e);
      return null;
    }

    const passphrase = await decrypt(encrypted, pinKey);
    
    console.log('✅ [KEY WRAPPING] PIN verified, passphrase decrypted');
    return passphrase;
  } catch (error) {
    console.error('Failed to verify PIN and decrypt passphrase:', error);
    return null;
  }
}

export async function verifyPIN(pin: string): Promise<boolean> {
  try {
    const passphrase = await verifyPINAndGetPassphrase(pin);
    return passphrase !== null;
  } catch (error) {
    console.error('Failed to verify PIN:', error);
    return false;
  }
}

// Helper types for storage operations
type StoreName = 'messages' | 'memories' | 'calendarEvents' | 'dailyRituals' | 'loveLetters' | 'futureLetters' | 'prayers' | 'reactions' | 'settings';

export async function getItemsSince(storeName: StoreName, timestamp: number): Promise<any[]> {
  const db = await initDBRaw();
  const tx = db.transaction(storeName, 'readonly');
  const store = tx.objectStore(storeName);
  const items = await store.getAll();
  // Filter by updatedAt if it exists, otherwise use timestamp, then filter by the provided timestamp
  return items.filter(item => {
    const itemTime = Number(item.updatedAt || item.timestamp || 0);
    return itemTime > timestamp;
  });
}

export async function saveMessage(message: Message): Promise<void> {
  try {
    const db = await initDB();
    const encrypted = await encryptMessage(message);
    const record = {
      id: message.id,
      ...encrypted,
      timestamp: message.timestamp, // Keep for indexing
    };
    await db.put('messages', record);
  } catch (error) {
    console.error('Failed to save message:', error);
    throw error;
  }
}

export async function saveIncomingItems(storeName: StoreName, items: any[]): Promise<void> {
  const db = await initDBRaw();
  const tx = db.transaction(storeName, 'readwrite');
  const store = tx.objectStore(storeName);
  for (const item of items) {
    await store.put(item);
  }
  await tx.done;
}

export async function clearAllData(): Promise<void> {
  const db = await initDBRaw();
  const stores: StoreName[] = ['messages', 'memories', 'calendarEvents', 'dailyRituals', 'loveLetters', 'futureLetters', 'prayers', 'reactions', 'settings'];
  const tx = db.transaction(stores, 'readwrite');
  for (const store of stores) {
    await tx.objectStore(store).clear();
  }
  await tx.done;
}

// REMOVED DUPLICATE getAllMessages

export async function saveMemory(memory: Memory): Promise<void> {
  try {
    const db = await initDB();
    const encrypted = await encryptMemory(memory);
    const record = {
      id: memory.id,
      ...encrypted,
    };
    await db.put('memories', record);
  } catch (error) {
    console.error('Failed to save memory:', error);
    throw error;
  }
}

// REMOVED DUPLICATE getAllMemories

export async function saveCalendarEvent(event: CalendarEvent): Promise<void> {
  try {
    const db = await initDB();
    const encrypted = await encryptCalendarEvent(event);
    const record = {
      id: event.id,
      ...encrypted,
    };
    await db.put('calendarEvents', record);
  } catch (error) {
    console.error('Failed to save calendar event:', error);
    throw error;
  }
}

export async function getAllCalendarEvents(): Promise<CalendarEvent[]> {
  const db = await initDB();
  const encryptedEvents = await db.getAll('calendarEvents');
  return Promise.all(encryptedEvents.map(enc => decryptCalendarEvent(enc)));
}

export async function deleteCalendarEvent(id: string): Promise<void> {
  const db = await initDB();
  await db.delete('calendarEvents', id);
}

export async function saveDailyRitual(ritual: DailyRitual): Promise<void> {
  try {
    const db = await initDB();
    const encrypted = await encryptDailyRitual(ritual);
    const record = {
      id: ritual.id,
      ...encrypted,
    };
    await db.put('dailyRituals', record);
  } catch (error) {
    console.error('Failed to save daily ritual:', error);
    throw error;
  }
}

export async function getAllDailyRituals(): Promise<DailyRitual[]> {
  const db = await initDB();
  const encryptedRituals = await db.getAll('dailyRituals');
  return Promise.all(encryptedRituals.map(enc => decryptDailyRitual(enc)));
}

export async function saveLoveLetter(letter: LoveLetter): Promise<void> {
  try {
    const db = await initDB();
    const encrypted = await encryptLoveLetter(letter);
    const record = {
      id: letter.id,
      ...encrypted,
    };
    await db.put('loveLetters', record);
  } catch (error) {
    console.error('Failed to save love letter:', error);
    throw error;
  }
}

// REMOVED DUPLICATE getAllLoveLetters

export async function saveFutureLetter(letter: FutureLetter): Promise<void> {
  const db = await initDB();
  const encrypted = await encryptFutureLetter(letter);
  const withId = { ...encrypted, id: letter.id };
  await db.put('loveLetters', withId);
}

export async function getAllFutureLetters(): Promise<FutureLetter[]> {
  const db = await initDB();
  const allEncrypted = await db.getAll('loveLetters');
  const decrypted = await Promise.all(
    allEncrypted.map(async (enc) => {
      try {
        return await decryptFutureLetter(enc);
      } catch {
        return null;
      }
    })
  );
  return decrypted.filter((letter): letter is FutureLetter => 
    letter !== null && 'unlockDate' in letter
  );
}

export async function savePrayer(prayer: Prayer): Promise<void> {
  const db = await initDB();
  const encrypted = await encryptPrayer(prayer);
  const withId = { ...encrypted, id: prayer.id };
  await db.put('loveLetters', withId);
}

// REMOVED DUPLICATE getAllPrayers

export async function saveReaction(reaction: Reaction): Promise<void> {
  try {
    const db = await initDB();
    const encrypted = await encryptReaction(reaction);
    const record = {
      id: reaction.id,
      ...encrypted,
    };
    await db.put('reactions', record);
  } catch (error) {
    console.error('Failed to save reaction:', error);
    throw error;
  }
}

export async function getAllReactions(): Promise<Reaction[]> {
  const db = await initDB();
  const encryptedReactions = await db.getAll('reactions');
  const allReactions = await Promise.all(encryptedReactions.map(enc => decryptReaction(enc)));
  return allReactions.sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
}

export async function getRecentReactions(limit: number = 10): Promise<Reaction[]> {
  const allReactions = await getAllReactions();
  return allReactions.slice(0, limit);
}
