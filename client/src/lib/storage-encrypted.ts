import { encrypt, decrypt, deriveKey, base64ToArrayBuffer } from '@/lib/crypto';
import { initDB as initDBRaw, getSetting as getSettingRaw, saveSetting as saveSettingRaw } from '@/lib/storage';
import type { Message, Memory, CalendarEvent, DailyRitual, LoveLetter, FutureLetter, Prayer, Reaction, EncryptedData } from '@/types';

let cachedKey: CryptoKey | null = null;

export const initDB = initDBRaw;
export const getSetting = getSettingRaw;
export const saveSetting = saveSettingRaw;

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
}

async function encryptObject<T>(obj: T): Promise<EncryptedData> {
  const key = await getEncryptionKey();
  const jsonStr = JSON.stringify(obj);
  return encrypt(jsonStr, key);
}

async function decryptObject<T>(encrypted: EncryptedData): Promise<T> {
  const key = await getEncryptionKey();
  const jsonStr = await decrypt(encrypted, key);
  return JSON.parse(jsonStr) as T;
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
