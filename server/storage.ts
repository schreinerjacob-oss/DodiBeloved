import type {
  Message, InsertMessage,
  Memory, InsertMemory,
  CalendarEvent, InsertCalendarEvent,
  DailyRitual, InsertDailyRitual,
  LoveLetter, InsertLoveLetter,
  Reaction, InsertReaction
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  saveMessage(message: InsertMessage): Promise<Message>;
  getAllMessages(): Promise<Message[]>;
  
  saveMemory(memory: InsertMemory): Promise<Memory>;
  getAllMemories(): Promise<Memory[]>;
  
  saveCalendarEvent(event: InsertCalendarEvent): Promise<CalendarEvent>;
  getAllCalendarEvents(): Promise<CalendarEvent[]>;
  
  saveDailyRitual(ritual: InsertDailyRitual): Promise<DailyRitual>;
  getAllDailyRituals(): Promise<DailyRitual[]>;
  
  saveLoveLetter(letter: InsertLoveLetter): Promise<LoveLetter>;
  getAllLoveLetters(): Promise<LoveLetter[]>;
  
  saveReaction(reaction: InsertReaction): Promise<Reaction>;
  getRecentReactions(limit: number): Promise<Reaction[]>;
}

export class MemStorage implements IStorage {
  private messages: Map<string, Message> = new Map();
  private memories: Map<string, Memory> = new Map();
  private calendarEvents: Map<string, CalendarEvent> = new Map();
  private dailyRituals: Map<string, DailyRitual> = new Map();
  private loveLetters: Map<string, LoveLetter> = new Map();
  private reactions: Map<string, Reaction> = new Map();

  async saveMessage(insertMessage: InsertMessage): Promise<Message> {
    const id = randomUUID();
    const message: Message = {
      ...insertMessage,
      id,
      timestamp: new Date(),
    };
    this.messages.set(id, message);
    return message;
  }

  async getAllMessages(): Promise<Message[]> {
    return Array.from(this.messages.values()).sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );
  }

  async saveMemory(insertMemory: InsertMemory): Promise<Memory> {
    const id = randomUUID();
    const memory: Memory = {
      ...insertMemory,
      id,
      timestamp: new Date(),
    };
    this.memories.set(id, memory);
    return memory;
  }

  async getAllMemories(): Promise<Memory[]> {
    return Array.from(this.memories.values()).sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );
  }

  async saveCalendarEvent(insertEvent: InsertCalendarEvent): Promise<CalendarEvent> {
    const id = randomUUID();
    const event: CalendarEvent = {
      ...insertEvent,
      id,
      createdAt: new Date(),
    };
    this.calendarEvents.set(id, event);
    return event;
  }

  async getAllCalendarEvents(): Promise<CalendarEvent[]> {
    return Array.from(this.calendarEvents.values()).sort(
      (a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime()
    );
  }

  async saveDailyRitual(insertRitual: InsertDailyRitual): Promise<DailyRitual> {
    const id = randomUUID();
    const ritual: DailyRitual = {
      ...insertRitual,
      id,
      ritualDate: new Date(),
    };
    this.dailyRituals.set(id, ritual);
    return ritual;
  }

  async getAllDailyRituals(): Promise<DailyRitual[]> {
    return Array.from(this.dailyRituals.values()).sort(
      (a, b) => a.ritualDate.getTime() - b.ritualDate.getTime()
    );
  }

  async saveLoveLetter(insertLetter: InsertLoveLetter): Promise<LoveLetter> {
    const id = randomUUID();
    const letter: LoveLetter = {
      ...insertLetter,
      id,
      createdAt: new Date(),
    };
    this.loveLetters.set(id, letter);
    return letter;
  }

  async getAllLoveLetters(): Promise<LoveLetter[]> {
    return Array.from(this.loveLetters.values()).sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    );
  }

  async saveReaction(insertReaction: InsertReaction): Promise<Reaction> {
    const id = randomUUID();
    const reaction: Reaction = {
      ...insertReaction,
      id,
      timestamp: new Date(),
    };
    this.reactions.set(id, reaction);
    return reaction;
  }

  async getRecentReactions(limit: number): Promise<Reaction[]> {
    return Array.from(this.reactions.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }
}

export const storage = new MemStorage();
