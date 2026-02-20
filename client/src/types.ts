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
  type?: 'text' | 'image' | 'voice' | 'video';
  mediaUrl?: string | null;
  isDisappearing?: boolean | null;
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'queued';
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

export interface FutureLetter {
  id: string;
  authorId: string;
  recipientId: string;
  title: string;
  content: string;
  createdAt: Date;
  unlockDate: Date;
  isUnlocked?: boolean;
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

// Moments tab: Saved Partner Details (private notes about partner)
export type PartnerDetailTag =
  | 'remember'
  | 'important'
  | 'follow-up'
  | 'funny'
  | 'sweet'
  | 'to celebrate'
  | 'to avoid';

export interface PartnerDetail {
  id: string;
  userId: string;
  partnerId?: string | null;
  content: string;
  tag: PartnerDetailTag;
  messageContext?: string | null;
  messageId?: string | null;
  createdAt: Date;
}

// Making New Moments: question progress (per path, per pair)
export interface MomentQuestionProgress {
  id: string; // `${userId}-${partnerId}-${path}`
  userId: string;
  partnerId: string;
  path: 1 | 2 | 3;
  lastQuestionIndex: number;
  updatedAt: Date;
}

// My Beloved: survey answers (one record per surveyId + userId)
export type BelovedSurveyId =
  | 'loveLanguage'
  | 'attachmentStyle'
  | 'apologyLanguage'
  | 'communicationStyle'
  | 'coreValues'
  | 'familyNorms'
  | 'likesDislikes'
  | 'dreamsFuture';

export interface BelovedSurveyAnswer {
  id: string; // `${surveyId}-${userId}`
  surveyId: BelovedSurveyId;
  userId: string;
  partnerId: string;
  answers: Record<string, string | string[]>;
  updatedAt: Date;
}

