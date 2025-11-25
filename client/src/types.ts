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
}

export interface Memory {
  id: string;
  userId: string;
  partnerId: string;
  imageData: string;
  caption?: string | null;
  createdAt: Date;
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
  date: Date;
  gratitude: string;
  thinking: string;
  wish: string;
  createdAt: Date;
}

export interface LoveLetter {
  id: string;
  senderId: string;
  recipientId: string;
  title: string;
  content: string;
  createdAt: Date;
  isRead?: boolean;
}

export interface FutureLetter {
  id: string;
  senderId: string;
  recipientId: string;
  title: string;
  content: string;
  deliverAt: Date;
  createdAt: Date;
  isDelivered?: boolean;
}

export interface Prayer {
  id: string;
  userId: string;
  partnerId: string;
  type: 'gratitude' | 'prayer';
  content: string;
  createdAt: Date;
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
}

export interface Subscription {
  id: string;
  pairingId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  plan: 'trial' | 'monthly' | 'yearly' | 'lifetime';
  status: 'trial' | 'active' | 'expired' | 'cancelled';
  trialEndsAt: Date | null;
  renewsAt: Date | null;
  createdAt: Date;
}
