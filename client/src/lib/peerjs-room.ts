import Peer, { DataConnection } from 'peerjs';

/**
 * PeerJS room connection manager
 * Connects two devices to same room via PeerJS relay
 */
export interface RoomConnection {
  peer: Peer;
  conn: DataConnection | null;
  isCreator: boolean;
  peerId: string;
}

/**
 * Initialize PeerJS peer instance
 */
export function initializePeer(peerId: string): Peer {
  return new Peer(peerId, {
    host: '0.peerjs.com',
    port: 443,
    secure: true,
    path: '/',
  });
}

/**
 * Create room as Device A (creator)
 * Generates peerId based on room code
 */
export function createRoomPeerId(roomCode: string, isCreator: boolean): string {
  const role = isCreator ? 'creator' : 'joiner';
  return `dodi-${roomCode}-${role}`;
}

/**
 * Get peer ID for connecting to room
 */
export function getRemotePeerId(roomCode: string, isCreator: boolean): string {
  const role = isCreator ? 'joiner' : 'creator';
  return `dodi-${roomCode}-${role}`;
}

/**
 * Wait for incoming connection
 */
export function waitForConnection(
  peer: Peer,
  timeout: number = 30000
): Promise<DataConnection> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Connection timeout'));
    }, timeout);

    peer.on('connection', (conn) => {
      clearTimeout(timer);
      conn.on('open', () => {
        resolve(conn);
      });
    });
  });
}

/**
 * Connect to peer
 */
export async function connectToRoom(
  peer: Peer,
  remotePeerId: string,
  timeout: number = 30000
): Promise<DataConnection> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Connection timeout'));
    }, timeout);

    try {
      const conn = peer.connect(remotePeerId);
      
      conn.on('open', () => {
        clearTimeout(timer);
        resolve(conn);
      });

      conn.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    } catch (error) {
      clearTimeout(timer);
      reject(error);
    }
  });
}

/**
 * Send message over connection
 */
export function sendMessage(conn: DataConnection, message: unknown): void {
  if (conn && conn.open) {
    conn.send(message);
  }
}

/**
 * Wait for message
 */
export function waitForMessage<T = unknown>(
  conn: DataConnection,
  timeout: number = 30000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Message timeout'));
    }, timeout);

    const handler = (data: T) => {
      clearTimeout(timer);
      conn.off('data', handler);
      resolve(data);
    };

    conn.on('data', handler);
  });
}

/**
 * Close connection and peer
 */
export function closeRoom(room: RoomConnection): void {
  if (room.conn) {
    room.conn.close();
    room.conn = null;
  }
  if (room.peer) {
    room.peer.destroy();
  }
}
