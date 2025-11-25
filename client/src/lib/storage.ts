import { openDB, type IDBPDatabase } from 'idb';
import type { Message, Memory, CalendarEvent, DailyRitual, LoveLetter, FutureLetter, Prayer, Reaction } from '@/types';

const DB_NAME = 'dodi-encrypted-storage';
const DB_VERSION = 1;

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

export async function saveMemory(memory: Memory): Promise<void> {
  const db = await initDB();
  await db.put('memories', memory);
}

export async function getAllMemories(): Promise<Memory[]> {
  const db = await initDB();
  return db.getAllFromIndex('memories', 'timestamp');
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
    if (value) return value;
  } catch (e) {
    console.warn('localStorage unavailable:', e);
  }

  // Fall back to IndexedDB
  try {
    const db = await initDB();
    const result = await db.get('settings', key);
    return result?.value;
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
