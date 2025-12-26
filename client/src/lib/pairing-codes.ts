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

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const getPart = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${getPart()}-${getPart()}`;
}

export function normalizeRoomCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isValidRoomCode(code: string): boolean {
  const normalized = normalizeRoomCode(code);
  return normalized.length === 8;
}
