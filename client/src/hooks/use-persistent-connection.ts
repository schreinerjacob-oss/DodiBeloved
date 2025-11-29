import { useEffect, useRef } from 'react';
import { useDodi } from '@/contexts/DodiContext';
import type Peer from 'peerjs';
import { initializePeer, createRoomPeerId, getRemotePeerId, connectToRoom } from '@/lib/peerjs-room';
import type { DataConnection } from 'peerjs';

// Global connection state so it persists across component mounts
const persistentConnectionStore = {
  peer: null as Peer | null,
  connection: null as DataConnection | null,
  isInitialized: false,
};

export function usePersistentConnection() {
  const { userId, partnerId, isPaired } = useDodi();
  const initRef = useRef(false);

  useEffect(() => {
    if (!userId || !partnerId || !isPaired || initRef.current) {
      return;
    }

    initRef.current = true;
    let mounted = true;

    const setupConnection = async () => {
      try {
        // If connection already exists and is open, use it
        if (persistentConnectionStore.connection?.open) {
          console.log('Persistent connection already open');
          return;
        }

        // Generate room code from user IDs for deterministic connection
        const roomCode = [userId, partnerId].sort().join(':').slice(0, 12);
        const isCreator = userId < partnerId; // Deterministic creator selection
        const myPeerId = createRoomPeerId(roomCode, isCreator);

        console.log('Setting up persistent connection:', {
          isCreator,
          myPeerId,
          roomCode,
        });

        let peer = persistentConnectionStore.peer;
        if (!peer) {
          peer = await initializePeer(myPeerId);
          persistentConnectionStore.peer = peer;
        }

        let connection = persistentConnectionStore.connection;

        if (!connection || !connection.open) {
          const remotePeerId = getRemotePeerId(roomCode, isCreator);

          if (isCreator) {
            // Creator waits for connection
            connection = await new Promise<DataConnection>((resolve, reject) => {
              const timeout = setTimeout(
                () => reject(new Error('Connection timeout')),
                30000
              );

              const handler = (conn: DataConnection) => {
                clearTimeout(timeout);
                peer!.off('connection', handler);
                resolve(conn);
              };

              peer!.on('connection', handler);
            });
          } else {
            // Joiner initiates connection
            connection = await connectToRoom(peer, remotePeerId, 5000);
          }

          persistentConnectionStore.connection = connection;

          // Set up message relay
          connection.on('data', (data) => {
            if (typeof data === 'string') {
              try {
                const message = JSON.parse(data);
                window.dispatchEvent(new CustomEvent('p2p-message', { detail: message }));
              } catch (e) {
                console.error('Error parsing message:', e);
              }
            }
          });

          connection.on('close', () => {
            console.log('Persistent connection closed, clearing state');
            persistentConnectionStore.connection = null;
          });

          connection.on('error', (error) => {
            console.error('Persistent connection error:', error);
          });

          console.log('Persistent connection established');
        }
      } catch (error) {
        console.error('Failed to setup persistent connection:', error);
      }
    };

    setupConnection();

    return () => {
      if (!mounted) return;
    };
  }, [userId, partnerId, isPaired]);

  return {
    send: (data: string) => {
      if (persistentConnectionStore.connection?.open) {
        persistentConnectionStore.connection.send(data);
      } else {
        console.warn('Connection not ready for sending');
      }
    },
    isConnected: persistentConnectionStore.connection?.open || false,
  };
}
