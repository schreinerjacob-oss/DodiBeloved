import { openDB, type IDBPDatabase } from 'idb';
import type { Message, Memory, CalendarEvent, DailyRitual, LoveLetter, FutureLetter, Prayer, Reaction } from '@/types';

const DB_NAME = 'dodi-encrypted-storage';
const DB_VERSION = 3;

interface QueuedMessage {
  id: string;
  message: string; // JSON stringified SyncMessage
  createdAt: number;
}

interface QueuedMedia {
  id: string; // mediaId
  kind: 'message' | 'memory';
  mime: string;
  createdAt: number;
}

interface DodiDB {
  messages: Message;
  memories: Memory;
  calendarEvents: CalendarEvent;
  dailyRituals: DailyRitual;
  loveLetters: LoveLetter;
  futureLetters: FutureLetter;
  prayers: Prayer;
  reactions: Reaction;
  settings: { key: string; value: string };
  messageMedia: { id: string; blob: Blob };
  memoryMedia: { id: string; blob: Blob };
  offlineQueue: QueuedMessage;
  offlineMediaQueue: QueuedMedia;
}

let dbInstance: IDBPDatabase<DodiDB> | null = null;

export async function initDB(): Promise<IDBPDatabase<DodiDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<DodiDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('messages')) {
        const messagesStore = db.createObjectStore('messages', { keyPath: 'id' });
        messagesStore.createIndex('timestamp', 'timestamp');
      }
      
      if (!db.objectStoreNames.contains('memories')) {
        const memoriesStore = db.createObjectStore('memories', { keyPath: 'id' });
        memoriesStore.createIndex('timestamp', 'timestamp');
      }
      
      if (!db.objectStoreNames.contains('calendarEvents')) {
        const eventsStore = db.createObjectStore('calendarEvents', { keyPath: 'id' });
        eventsStore.createIndex('eventDate', 'eventDate');
      }
      
      if (!db.objectStoreNames.contains('dailyRituals')) {
        const ritualsStore = db.createObjectStore('dailyRituals', { keyPath: 'id' });
        ritualsStore.createIndex('ritualDate', 'ritualDate');
      }
      
      if (!db.objectStoreNames.contains('loveLetters')) {
        const lettersStore = db.createObjectStore('loveLetters', { keyPath: 'id' });
        lettersStore.createIndex('createdAt', 'createdAt');
      }
      
      if (!db.objectStoreNames.contains('futureLetters')) {
        const futureLettersStore = db.createObjectStore('futureLetters', { keyPath: 'id' });
        futureLettersStore.createIndex('unlockDate', 'unlockDate');
      }

      if (!db.objectStoreNames.contains('prayers')) {
        const prayersStore = db.createObjectStore('prayers', { keyPath: 'id' });
        prayersStore.createIndex('prayerDate', 'prayerDate');
      }
      
      if (!db.objectStoreNames.contains('reactions')) {
        const reactionsStore = db.createObjectStore('reactions', { keyPath: 'id' });
        reactionsStore.createIndex('timestamp', 'timestamp');
      }
      
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }

      if (!db.objectStoreNames.contains('messageMedia')) {
        db.createObjectStore('messageMedia', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('memoryMedia')) {
        db.createObjectStore('memoryMedia', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('offlineQueue')) {
        const queueStore = db.createObjectStore('offlineQueue', { keyPath: 'id' });
        queueStore.createIndex('createdAt', 'createdAt');
      }

      if (!db.objectStoreNames.contains('offlineMediaQueue')) {
        const mediaQueueStore = db.createObjectStore('offlineMediaQueue', { keyPath: 'id' });
        mediaQueueStore.createIndex('createdAt', 'createdAt');
      }
    },
  });

  return dbInstance;
}

export async function saveMessage(message: Message): Promise<void> {
  const db = await initDB();
  await db.put('messages', message);
}

export async function getAllMessages(): Promise<Message[]> {
  const db = await initDB();
  return db.getAllFromIndex('messages', 'timestamp');
}

export async function getMessages(limit: number = 50, offset: number = 0): Promise<Message[]> {
  const db = await initDB();
  const allMessages = await db.getAllFromIndex('messages', 'timestamp');
  return allMessages.slice(Math.max(0, allMessages.length - offset - limit), allMessages.length - offset);
}

export async function saveMemory(memory: Memory): Promise<void> {
  const db = await initDB();
  await db.put('memories', memory);
}

export async function getAllMemories(): Promise<Memory[]> {
  const db = await initDB();
  return db.getAllFromIndex('memories', 'timestamp');
}

export async function getMemories(limit: number = 20, offset: number = 0): Promise<Memory[]> {
  const db = await initDB();
  const allMemories = await db.getAllFromIndex('memories', 'timestamp');
  return allMemories.slice(Math.max(0, allMemories.length - offset - limit), allMemories.length - offset);
}

export async function saveCalendarEvent(event: CalendarEvent): Promise<void> {
  const db = await initDB();
  await db.put('calendarEvents', event);
}

export async function getAllCalendarEvents(): Promise<CalendarEvent[]> {
  const db = await initDB();
  return db.getAll('calendarEvents');
}

export async function saveDailyRitual(ritual: DailyRitual): Promise<void> {
  const db = await initDB();
  await db.put('dailyRituals', ritual);
}

export async function getAllDailyRituals(): Promise<DailyRitual[]> {
  const db = await initDB();
  return db.getAllFromIndex('dailyRituals', 'ritualDate');
}

export async function saveLoveLetter(letter: LoveLetter): Promise<void> {
  const db = await initDB();
  await db.put('loveLetters', letter);
}

export async function getAllLoveLetters(): Promise<LoveLetter[]> {
  const db = await initDB();
  return db.getAllFromIndex('loveLetters', 'createdAt');
}

// Blob storage helpers
export async function saveMediaBlob(mediaId: string, blob: Blob, type: 'message' | 'memory'): Promise<void> {
  const db = await initDB();
  const storeName = type === 'message' ? 'messageMedia' : 'memoryMedia';
  await db.put(storeName as any, { id: mediaId, blob });
}

export async function getMediaBlob(mediaId: string, type: 'message' | 'memory'): Promise<Blob | undefined> {
  const db = await initDB();
  const storeName = type === 'message' ? 'messageMedia' : 'memoryMedia';
  const result = await db.get(storeName as any, mediaId);
  return result?.blob;
}

export async function deleteMediaBlob(mediaId: string, type: 'message' | 'memory'): Promise<void> {
  const db = await initDB();
  const storeName = type === 'message' ? 'messageMedia' : 'memoryMedia';
  await db.delete(storeName as any, mediaId);
}

export async function saveReaction(reaction: Reaction): Promise<void> {
  const db = await initDB();
  await db.put('reactions', reaction);
}

export async function getRecentReactions(limit: number = 10): Promise<Reaction[]> {
  const db = await initDB();
  const all = await db.getAllFromIndex('reactions', 'timestamp');
  return all.slice(-limit).reverse();
}

export async function saveSetting(key: string, value: string): Promise<void> {
  // Always save to both IndexedDB and localStorage for persistence
  // localStorage is more reliable for PWA pairing data
  try {
    localStorage.setItem(`dodi-${key}`, value);
  } catch (e) {
    console.warn('localStorage unavailable:', e);
  }
  
  const db = await initDB();
  await db.put('settings', { key, value });
}

export async function getSetting(key: string): Promise<string | undefined> {
  // Try localStorage first (faster, more reliable for PWA)
  try {
    const value = localStorage.getItem(`dodi-${key}`);
    if (value) {
      console.log(`📦 [STORAGE] Found ${key} in localStorage`);
      return value;
    }
  } catch (e) {
    console.warn('localStorage unavailable:', e);
  }

  // Fall back to IndexedDB
  try {
    const db = await initDB();
    const result = await db.get('settings', key);
    const value = (result as any)?.value || result;
    if (value) {
      console.log(`📦 [STORAGE] Found ${key} in IndexedDB`);
      return value;
    }
    return undefined;
  } catch (e) {
    console.error('Failed to get setting from IndexedDB:', e);
    return undefined;
  }
}

export async function saveFutureLetter(letter: FutureLetter): Promise<void> {
  const db = await initDB();
  await db.put('futureLetters', letter);
}

export async function getAllFutureLetters(): Promise<FutureLetter[]> {
  const db = await initDB();
  return db.getAllFromIndex('futureLetters', 'unlockDate');
}

export async function savePrayer(prayer: Prayer): Promise<void> {
  const db = await initDB();
  await db.put('prayers', prayer);
}

export async function getAllPrayers(): Promise<Prayer[]> {
  const db = await initDB();
  return db.getAllFromIndex('prayers', 'prayerDate');
}

// Offline Queue persistence
export async function saveToOfflineQueue(id: string, message: unknown): Promise<void> {
  const db = await initDB();
  await db.put('offlineQueue', {
    id,
    message: JSON.stringify(message),
    createdAt: Date.now(),
  });
}

export async function getOfflineQueue(): Promise<Array<{ id: string; message: unknown }>> {
  try {
    const db = await initDB();
    const items = await db.getAllFromIndex('offlineQueue', 'createdAt');
    return items.map(item => ({
      id: item.id,
      message: JSON.parse(item.message),
    }));
  } catch (e) {
    console.warn('Failed to get offline queue:', e);
    return [];
  }
}

export async function removeFromOfflineQueue(id: string): Promise<void> {
  const db = await initDB();
  await db.delete('offlineQueue', id);
}

export async function clearOfflineQueue(): Promise<void> {
  const db = await initDB();
  await db.clear('offlineQueue');
}

export async function getOfflineQueueSize(): Promise<number> {
  try {
    const db = await initDB();
    return await db.count('offlineQueue');
  } catch (e) {
    return 0;
  }
}

// Offline MEDIA queue persistence (blobs are stored in messageMedia/memoryMedia stores)
export async function saveToOfflineMediaQueue(mediaId: string, kind: 'message' | 'memory', mime: string): Promise<void> {
  const db = await initDB();
  await db.put('offlineMediaQueue', {
    id: mediaId,
    kind,
    mime,
    createdAt: Date.now(),
  });
}

export async function getOfflineMediaQueue(): Promise<Array<{ id: string; kind: 'message' | 'memory'; mime: string }>> {
  try {
    const db = await initDB();
    const items = await db.getAllFromIndex('offlineMediaQueue', 'createdAt');
    return items.map((item) => ({ id: item.id, kind: item.kind, mime: item.mime }));
  } catch (e) {
    console.warn('Failed to get offline media queue:', e);
    return [];
  }
}

export async function isInOfflineMediaQueue(mediaId: string): Promise<boolean> {
  try {
    const db = await initDB();
    const existing = await db.get('offlineMediaQueue' as any, mediaId);
    return !!existing;
  } catch {
    return false;
  }
}

export async function removeFromOfflineMediaQueue(mediaId: string): Promise<void> {
  const db = await initDB();
  await db.delete('offlineMediaQueue', mediaId);
}
