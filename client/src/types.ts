export interface EncryptedData {
  iv: string;
  data: string;
}

export interface Message {
  id: string;
  senderId: string;
  recipientId: string;
  content: string;
  timestamp: Date;
  disappearsAt?: Date | null;
  isRead?: boolean;
  type?: 'text' | 'image' | 'voice';
  mediaUrl?: string | null;
  isDisappearing?: boolean | null;
  status?: 'sending' | 'sent' | 'delivered' | 'read';
  reactions?: { [userId: string]: string };
}

export interface Memory {
  id: string;
  userId: string;
  partnerId: string;
  imageData: string;
  caption?: string | null;
  createdAt: Date;
  timestamp: Date;
  mediaUrl?: string | null;
  mediaType?: 'image' | 'video' | 'photo';
}

export interface CalendarEvent {
  id: string;
  userId: string;
  partnerId: string;
  title: string;
  description?: string | null;
  eventDate: Date;
  isAnniversary: boolean;
  createdAt: Date;
}

export interface DailyRitual {
  id: string;
  userId: string;
  partnerId: string;
  ritualDate: Date;
  emotion?: string;
  lovedMoment?: string;
  gratitude: string;
  tomorrowNeed?: string;
  createdAt: Date;
}

export interface LoveLetter {
  id: string;
  authorId: string;
  recipientId: string;
  title: string;
  content: string;
  createdAt: Date;
  isRead?: boolean;
}


export interface Prayer {
  id: string;
  userId: string;
  partnerId: string;
  pairingId?: string | null;
  type?: 'gratitude' | 'prayer';
  content?: string;
  gratitudeEntry?: string | null;
  prayerEntry?: string | null;
  createdAt: Date;
  prayerDate: Date;
  isRevealed?: boolean;
}

export interface Reaction {
  id: string;
  senderId: string;
  recipientId: string;
  type: string;
  timestamp: Date;
}

export interface PeerSignal {
  type: 'offer' | 'answer';
  sdp: string;
  ice?: string[];
}

export interface SyncMessage {
  type: string;
  data: unknown;
  timestamp: number;
  // data can contain ArrayBuffer for binary media (no Base64 overhead)
}

