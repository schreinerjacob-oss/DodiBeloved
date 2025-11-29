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
 * Initialize PeerJS peer instance and wait for it to open
 */
export function initializePeer(peerId: string): Promise<Peer> {
  return new Promise((resolve, reject) => {
    const peer = new Peer(peerId, {
      host: '0.peerjs.com',
      port: 443,
      secure: true,
      path: '/',
      debug: 2, // Enable debug logging
    });

    const timeout = setTimeout(() => {
      peer.destroy();
      reject(new Error('Peer initialization timeout'));
    }, 10000);

    peer.on('open', () => {
      clearTimeout(timeout);
      console.log(`✓ Peer initialized: ${peerId}`);
      resolve(peer);
    });

    peer.on('error', (err) => {
      clearTimeout(timeout);
      console.error('Peer error:', err);
      reject(new Error(`Peer error: ${err.type}`));
    });
  });
}

/**
 * Create room as Device A (creator)
 * Generates peerId based on room code
 */
export function createRoomPeerId(roomCode: string, isCreator: boolean): string {
  const role = isCreator ? 'c' : 'j';
  // Use shorter IDs to avoid PeerJS limitations
  return `dodi${roomCode}${role}`;
}

/**
 * Get peer ID for connecting to room
 */
export function getRemotePeerId(roomCode: string, isCreator: boolean): string {
  const role = isCreator ? 'j' : 'c';
  return `dodi${roomCode}${role}`;
}

/**
 * Wait for incoming connection
 */
export function waitForConnection(
  peer: Peer,
  timeout: number = 120000
): Promise<DataConnection> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      peer.off('connection', connectionHandler);
      reject(new Error('Connection timeout - partner did not connect'));
    }, timeout);

    const connectionHandler = (conn: DataConnection) => {
      console.log('✓ Incoming connection from:', conn.peer);
      clearTimeout(timer);
      peer.off('connection', connectionHandler);
      
      // Wait for connection to open
      if (conn.open) {
        resolve(conn);
      } else {
        conn.on('open', () => {
          resolve(conn);
        });
        conn.on('error', (err) => {
          reject(err);
        });
      }
    };

    peer.on('connection', connectionHandler);
  });
}

/**
 * Connect to peer in room
 */
export async function connectToRoom(
  peer: Peer,
  remotePeerId: string,
  timeout: number = 30000
): Promise<DataConnection> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Connection timeout - creator not found'));
    }, timeout);

    try {
      console.log(`🔗 Connecting to creator: ${remotePeerId}`);
      const conn = peer.connect(remotePeerId, { reliable: true });
      
      conn.on('open', () => {
        console.log('✓ Connection opened');
        clearTimeout(timer);
        resolve(conn);
      });

      conn.on('error', (err) => {
        console.error('Connection error:', err);
        clearTimeout(timer);
        reject(new Error(`Connection failed: ${err}`));
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
      conn.off('data', handler);
      reject(new Error('Message timeout'));
    }, timeout);

    const handler = (data: unknown) => {
      clearTimeout(timer);
      conn.off('data', handler);
      resolve(data as T);
    };

    conn.on('data', handler);
  });
}

/**
 * Close connection and peer
 */
export function closeRoom(room: RoomConnection): void {
  try {
    if (room.conn) {
      room.conn.close();
      room.conn = null;
    }
    if (room.peer) {
      room.peer.destroy();
    }
  } catch (error) {
    console.error('Error closing room:', error);
  }
}
