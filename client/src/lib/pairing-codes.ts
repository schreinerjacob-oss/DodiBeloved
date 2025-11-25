export interface PairingPayload {
  creatorId: string;
  passphrase: string;
  offer: string;
  sessionId: string;
  createdAt: number;
}

export interface JoinerResponse {
  joinerId: string;
  answer: string;
  shortCode: string;
  sessionId: string;
}

export function encodePairingPayload(payload: PairingPayload): string {
  return btoa(JSON.stringify(payload));
}

export function decodePairingPayload(encoded: string): PairingPayload | null {
  try {
    return JSON.parse(atob(encoded));
  } catch {
    return null;
  }
}

export async function generateShortCode(answer: string, sessionId: string): Promise<string> {
  const data = `${answer}:${sessionId}`;
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  const hashArray = new Uint8Array(hashBuffer);
  
  let code = 0;
  for (let i = 0; i < 4; i++) {
    code = (code * 256 + hashArray[i]) % 1000000;
  }
  
  return code.toString().padStart(6, '0');
}

export function encodeJoinerResponse(response: JoinerResponse): string {
  return btoa(JSON.stringify(response));
}

export function decodeJoinerResponse(encoded: string): JoinerResponse | null {
  try {
    return JSON.parse(atob(encoded));
  } catch {
    return null;
  }
}

const PENDING_SESSION_KEY = 'dodi-pending-session';

export interface PendingSession {
  sessionId: string;
  creatorId: string;
  passphrase: string;
  offer: string;
  createdAt: number;
}

export function savePendingSession(session: PendingSession): void {
  localStorage.setItem(PENDING_SESSION_KEY, JSON.stringify(session));
}

export function getPendingSession(): PendingSession | null {
  const data = localStorage.getItem(PENDING_SESSION_KEY);
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export function clearPendingSession(): void {
  localStorage.removeItem(PENDING_SESSION_KEY);
}

const JOINER_RESPONSE_KEY = 'dodi-joiner-response';

export function saveJoinerResponse(response: JoinerResponse): void {
  localStorage.setItem(JOINER_RESPONSE_KEY, JSON.stringify(response));
}

export function getJoinerResponse(): JoinerResponse | null {
  const data = localStorage.getItem(JOINER_RESPONSE_KEY);
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export function clearJoinerResponse(): void {
  localStorage.removeItem(JOINER_RESPONSE_KEY);
}
