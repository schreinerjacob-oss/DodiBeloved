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
