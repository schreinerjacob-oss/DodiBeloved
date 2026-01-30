const PENDING_SESSION_KEY = 'dodi-pending-tunnel';

export interface PendingTunnelSession {
  sessionId: string;
  creatorId: string;
  offer: string;
  publicKey: string;
  fingerprint: string;
  createdAt: number;
}

export function savePendingTunnelSession(session: PendingTunnelSession): void {
  localStorage.setItem(PENDING_SESSION_KEY, JSON.stringify(session));
}

export function getPendingTunnelSession(): PendingTunnelSession | null {
  const data = localStorage.getItem(PENDING_SESSION_KEY);
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export function clearPendingTunnelSession(): void {
  localStorage.removeItem(PENDING_SESSION_KEY);
}

/** Generates an 8-character room code; displayed with a dash (XXXX-XXXX) for readability. The dash is display-only. */
export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const getPart = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${getPart()}-${getPart()}`;
}

/** Strips to 8 alphanumeric chars only. The dash is never part of the actual code used for connection. */
export function normalizeRoomCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

/** Format 8 alphanumeric chars as XXXX-XXXX for display only; dash is not part of the code. */
export function formatCodeWithDash(raw: string): string {
  const normalized = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  if (normalized.length <= 4) return normalized;
  return `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
}

export function isValidRoomCode(code: string): boolean {
  const normalized = normalizeRoomCode(code);
  return normalized.length === 8;
}
