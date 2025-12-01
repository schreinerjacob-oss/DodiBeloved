import { encrypt, decrypt, deriveKey, base64ToArrayBuffer } from '@/lib/crypto';
import { initDB as initDBRaw, getSetting as getSettingRaw, saveSetting as saveSettingRaw, saveMediaBlob, getMediaBlob, deleteMediaBlob, getMessages as getMessagesRaw, getMemories as getMemoriesRaw } from '@/lib/storage';
import type { Message, Memory, CalendarEvent, DailyRitual, LoveLetter, FutureLetter, Prayer, Reaction, EncryptedData } from '@/types';

let cachedKey: CryptoKey | null = null;
let cachedPINKey: CryptoKey | null = null;

export const initDB = initDBRaw;
export const getSetting = getSettingRaw;
export const saveSetting = saveSettingRaw;
export const getMessages = getMessagesRaw;
export const getMemories = getMemoriesRaw;

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

    // Derive key from PIN + salt
    const salt = base64ToArrayBuffer(storedSalt.value);
    const pinKey = await derivePINKey(pin, salt);
    
    // Encrypt passphrase with PIN
    const encryptedPassphrase = await encrypt(passphrase, pinKey);
    
    // Encrypt PIN for verification
    const { arrayBufferToBase64 } = await import('@/lib/crypto');
    const mainKey = await getEncryptionKey();
    const encryptedPin = await encrypt(pin, mainKey);
    
    // Save encrypted passphrase and encrypted PIN, delete plaintext passphrase
    await Promise.all([
      db.put('settings', { 
        key: 'encryptedPassphrase', 
        value: JSON.stringify(encryptedPassphrase)
      }),
      db.put('settings', { 
        key: 'pin', 
        value: JSON.stringify(encryptedPin)
      }),
      db.delete('settings', 'passphrase'), // DELETE plaintext!
    ]);
    
    console.log('✅ [KEY WRAPPING] Passphrase encrypted with PIN, plaintext deleted');
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

    // Derive key from PIN + salt
    const salt = base64ToArrayBuffer(storedSalt.value);
    const pinKey = await derivePINKey(pin, salt);
    
    // Try to decrypt passphrase with PIN
    const encrypted: EncryptedData = JSON.parse(storedEncryptedPassphrase.value);
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

export async function saveMessage(message: Message): Promise<void> {
  try {
    const db = await initDB();
    const encrypted = await encryptMessage(message);
    // Preserve the ID as the primary key while storing encrypted blob
    const record = {
      id: message.id,
      ...encrypted,
    };
    await db.put('messages', record);
  } catch (error) {
    console.error('Failed to save message:', error);
    throw error;
  }
}

export async function getAllMessages(): Promise<Message[]> {
  const db = await initDB();
  const encryptedMessages = await db.getAll('messages');
  return Promise.all(encryptedMessages.map(enc => decryptMessage(enc)));
}

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

export async function getAllMemories(): Promise<Memory[]> {
  const db = await initDB();
  const encryptedMemories = await db.getAll('memories');
  return Promise.all(encryptedMemories.map(enc => decryptMemory(enc)));
}

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

export async function getAllLoveLetters(): Promise<LoveLetter[]> {
  const db = await initDB();
  const encryptedLetters = await db.getAll('loveLetters');
  return Promise.all(encryptedLetters.map(enc => decryptLoveLetter(enc)));
}

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

export async function getAllPrayers(): Promise<Prayer[]> {
  const db = await initDB();
  const allEncrypted = await db.getAll('loveLetters');
  const decrypted = await Promise.all(
    allEncrypted.map(async (enc) => {
      try {
        return await decryptPrayer(enc);
      } catch {
        return null;
      }
    })
  );
  return decrypted.filter((item): item is Prayer => 
    item !== null && 'gratitude' in item
  );
}

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
