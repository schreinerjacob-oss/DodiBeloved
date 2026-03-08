/**
 * Mood options for the chat header "whisper" — changeable at any time.
 * Synced to partner via P2P so they see "Beloved is feeling X".
 */

export const MOODS = [
  { id: 'happy', label: 'Happy' },
  { id: 'calm', label: 'Calm' },
  { id: 'thinking-of-you', label: 'Thinking of you' },
  { id: 'tired', label: 'Tired' },
  { id: 'grateful', label: 'Grateful' },
  { id: 'missing-you', label: 'Missing you' },
  { id: 'excited', label: 'Excited' },
  { id: 'peaceful', label: 'Peaceful' },
  { id: 'loved', label: 'Loved' },
  { id: 'hopeful', label: 'Hopeful' },
] as const;

export type MoodId = (typeof MOODS)[number]['id'];

export function getMoodLabel(id: MoodId | string): string {
  const m = MOODS.find((x) => x.id === id);
  return m?.label ?? id;
}
