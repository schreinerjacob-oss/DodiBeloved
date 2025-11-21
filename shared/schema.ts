import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  senderId: text("sender_id").notNull(),
  recipientId: text("recipient_id").notNull(),
  content: text("content").notNull(),
  type: text("type").notNull(),
  mediaUrl: text("media_url"),
  isDisappearing: boolean("is_disappearing").default(false),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const memories = pgTable("memories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  partnerId: text("partner_id").notNull(),
  mediaUrl: text("media_url").notNull(),
  mediaType: text("media_type").notNull(),
  caption: text("caption"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const calendarEvents = pgTable("calendar_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  partnerId: text("partner_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  eventDate: timestamp("event_date").notNull(),
  isAnniversary: boolean("is_anniversary").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const dailyRituals = pgTable("daily_rituals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  partnerId: text("partner_id").notNull(),
  emotion: text("emotion").notNull(),
  lovedMoment: text("loved_moment").notNull(),
  gratitude: text("gratitude").notNull(),
  tomorrowNeed: text("tomorrow_need").notNull(),
  ritualDate: timestamp("ritual_date").defaultNow().notNull(),
});

export const loveLetters = pgTable("love_letters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  authorId: text("author_id").notNull(),
  recipientId: text("recipient_id").notNull(),
  title: text("title"),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const reactions = pgTable("reactions", {
  id: varchar("id").primaryKey(),
  senderId: text("sender_id").notNull(),
  recipientId: text("recipient_id").notNull(),
  type: text("type").notNull(),
  timestamp: timestamp("timestamp").notNull(),
});

export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, timestamp: true });
export const insertMemorySchema = createInsertSchema(memories).omit({ id: true, timestamp: true });
export const insertCalendarEventSchema = createInsertSchema(calendarEvents).omit({ id: true, createdAt: true });
export const insertDailyRitualSchema = createInsertSchema(dailyRituals).omit({ id: true, ritualDate: true });
export const insertLoveLetterSchema = createInsertSchema(loveLetters).omit({ id: true, createdAt: true });
export const insertReactionSchema = createInsertSchema(reactions).omit({ id: true, timestamp: true });

export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

export type Memory = typeof memories.$inferSelect;
export type InsertMemory = z.infer<typeof insertMemorySchema>;

export type CalendarEvent = typeof calendarEvents.$inferSelect;
export type InsertCalendarEvent = z.infer<typeof insertCalendarEventSchema>;

export type DailyRitual = typeof dailyRituals.$inferSelect;
export type InsertDailyRitual = z.infer<typeof insertDailyRitualSchema>;

export type LoveLetter = typeof loveLetters.$inferSelect;
export type InsertLoveLetter = z.infer<typeof insertLoveLetterSchema>;

export type Reaction = typeof reactions.$inferSelect;
export type InsertReaction = z.infer<typeof insertReactionSchema>;

export interface PairingData {
  userId: string;
  passphrase: string;
  publicKey: string;
}

export interface EncryptedData {
  iv: string;
  data: string;
}
