/**
 * Heart Whispers: 2–3 gentle prompts per week, Chat only.
 * 7 prompts; getNextWhisper(settings) returns the next to show or null.
 */

export const HEART_WHISPERS = [
  { id: 'hw1', text: "What's one small thing you're curious about in your partner this week?" },
  { id: 'hw2', text: 'When did you last feel really seen by each other?' },
  { id: 'hw3', text: "What's a boundary that's been helping you both lately?" },
  { id: 'hw4', text: "What's one way you'd like to show up for them without them having to ask?" },
  { id: 'hw5', text: 'When do you feel most yourself with them?' },
  { id: 'hw6', text: "What's something you've been meaning to say but haven't found the moment?" },
  { id: 'hw7', text: "What's one thing you appreciate about how they handle conflict?" },
] as const;

export type HeartWhisperId = (typeof HEART_WHISPERS)[number]['id'];

export interface HeartWhisperPrompt {
  id: HeartWhisperId;
  text: string;
}

export interface HeartWhisperSettings {
  lastWhisperShownAt?: string;
  lastWhisperId?: string;
  dismissedWhisperIds?: string;
  dismissedWhisperIdsWeekStart?: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const SLOT_MS = (2.5 * MS_PER_DAY); // ~2–3 per week => one every ~2.5 days

/** Monday 00:00:00 of the week containing date. Uses time arithmetic to avoid setDate(n) with negative n. */
export function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday, 1 = Monday, ...
  const daysBackToMonday = day === 0 ? 6 : day - 1;
  d.setTime(d.getTime() - daysBackToMonday * MS_PER_DAY);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Returns the next whisper to show, or null if none this slot.
 * Uses lastWhisperShownAt, lastWhisperId, dismissedWhisperIds (comma-separated; cleared each week).
 */
export function getNextWhisper(settings: HeartWhisperSettings): HeartWhisperPrompt | null {
  const now = Date.now();
  const lastAt = settings.lastWhisperShownAt ? Number(settings.lastWhisperShownAt) : 0;
  if (now - lastAt < SLOT_MS) return null;

  const weekStart = getStartOfWeek(new Date()).getTime();
  const savedWeekStart = settings.dismissedWhisperIdsWeekStart ? Number(settings.dismissedWhisperIdsWeekStart) : 0;
  let dismissed = weekStart > savedWeekStart ? [] : (settings.dismissedWhisperIds || '').split(',').filter(Boolean);

  const lastId = settings.lastWhisperId;
  const available = HEART_WHISPERS.filter(
    (w) => w.id !== lastId && !dismissed.includes(w.id)
  );
  if (available.length === 0) return null;

  const pick = available[Math.floor(Math.random() * available.length)];
  return { id: pick.id, text: pick.text };
}
