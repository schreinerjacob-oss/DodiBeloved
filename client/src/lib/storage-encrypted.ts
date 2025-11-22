import { encrypt, decrypt, deriveKey, base64ToArrayBuffer } from '@/lib/crypto';
import { getSetting } from '@/lib/storage';
import type { Message, Memory, CalendarEvent, DailyRitual, LoveLetter, FutureLetter, Prayer, Reaction, EncryptedData } from '@shared/schema';

let cachedKey: CryptoKey | null = null;

export async function getEncryptionKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;

  const storedPassphrase = await getSetting('passphrase');
  const storedSalt = await getSetting('salt');

  if (!storedPassphrase || !storedSalt) {
    throw new Error('No encryption key available');
  }

  const salt = base64ToArrayBuffer(storedSalt);
  cachedKey = await deriveKey(storedPassphrase, salt);
  return cachedKey;
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
