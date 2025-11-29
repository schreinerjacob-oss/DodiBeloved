import { useEffect, useRef, useState, useCallback } from 'react';
import { useDodi } from '@/contexts/DodiContext';
import type { SyncMessage } from '@/types';
import Peer, { type DataConnection } from 'peerjs';

interface PeerConnectionState {
  connected: boolean;
  connecting: boolean;
  error: string | null;
}

interface UsePeerConnectionReturn {
  state: PeerConnectionState;
  send: (message: SyncMessage) => void;
  disconnect: () => void;
}

export function usePeerConnection(): UsePeerConnectionReturn {
  const { userId, partnerId, isPaired } = useDodi();
  const [state, setState] = useState<PeerConnectionState>({
    connected: false,
    connecting: false,
    error: null,
  });

  const peerInstanceRef = useRef<Peer | null>(null);
  const connectionRef = useRef<DataConnection | null>(null);
  const messageQueueRef = useRef<SyncMessage[]>([]);
  const connectionAttemptRef = useRef<NodeJS.Timeout | null>(null);

  const flushMessageQueue = useCallback(() => {
    if (!connectionRef.current || connectionRef.current.open === false) {
      console.log('Cannot flush queue - connection not open');
      return;
    }

    const queuedCount = messageQueueRef.current.length;
    if (queuedCount === 0) {
      return;
    }

    console.log('Flushing', queuedCount, 'queued messages');
    let sentCount = 0;

    while (messageQueueRef.current.length > 0) {
      const message = messageQueueRef.current.shift();
      if (message) {
        try {
          connectionRef.current.send(JSON.stringify(message));
          sentCount++;
        } catch (e) {
          console.error('Error sending queued message:', e);
          messageQueueRef.current.unshift(message);
          break;
        }
      }
    }

    console.log('Flushed', sentCount, 'messages');
  }, []);

  const send = useCallback((message: SyncMessage) => {
    const fullMessage = { ...message, timestamp: Date.now(), id: `${Date.now()}-${Math.random()}` };

    if (connectionRef.current && connectionRef.current.open) {
      try {
        connectionRef.current.send(JSON.stringify(fullMessage));
        console.log('P2P message sent:', message.type, fullMessage.id);
      } catch (e) {
        console.error('Error sending P2P message:', e);
        messageQueueRef.current.push(fullMessage);
      }
    } else {
      console.log('P2P not ready, queueing message:', message.type);
      messageQueueRef.current.push(fullMessage);
    }
  }, []);

  const handleIncomingMessage = useCallback((data: string) => {
    try {
      const message: SyncMessage = JSON.parse(data);
      console.log('P2P received:', message.type);
      window.dispatchEvent(new CustomEvent('p2p-message', { detail: message }));
    } catch (e) {
      console.error('Error parsing P2P message:', e);
    }
  }, []);

  const setupConnection = useCallback((connection: DataConnection) => {
    connectionRef.current = connection;

    connection.on('open', () => {
      console.log('Data connection opened with', connection.peer);
      setState({ connected: true, connecting: false, error: null });
      flushMessageQueue();
    });

    connection.on('close', () => {
      console.log('Data connection closed');
      setState({ connected: false, connecting: false, error: null });
      connectionRef.current = null;
    });

    connection.on('error', (error) => {
      console.error('Connection error:', error);
      setState(prev => ({ ...prev, error: error.message }));
    });

    connection.on('data', (data) => {
      if (typeof data === 'string') {
        handleIncomingMessage(data);
      }
    });
  }, [flushMessageQueue, handleIncomingMessage]);

  const initializePeerConnection = useCallback(() => {
    if (!userId) {
      console.log('Cannot initialize - no userId');
      return;
    }

    if (peerInstanceRef.current) {
      console.log('Peer already initialized');
      return;
    }

    console.log('Initializing PeerJS instance for userId:', userId);

    const peer = new Peer(userId, {
      host: window.location.hostname,
      port: 9000,
      path: '/peerjs',
      secure: window.location.protocol === 'https:',
      config: {
        iceServers: [
          { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }
        ]
      }
    });

    peer.on('open', (id) => {
      console.log('PeerJS peer opened with ID:', id);
    });

    peer.on('error', (error) => {
      console.error('Peer error:', error);
      setState(prev => ({ ...prev, error: error.message }));
    });

    peer.on('connection', (connection) => {
      console.log('Incoming connection from', connection.peer);
      setupConnection(connection);
    });

    peerInstanceRef.current = peer;
  }, [userId, setupConnection]);

  const connectToPartner = useCallback(() => {
    if (!userId || !partnerId) {
      console.log('Cannot connect - missing userId or partnerId');
      return;
    }

    if (!peerInstanceRef.current) {
      console.log('Peer not initialized yet, will retry');
      return;
    }

    if (connectionRef.current && connectionRef.current.open) {
      console.log('Already connected to partner');
      return;
    }

    console.log('Connecting to partner:', partnerId);
    setState({ connected: false, connecting: true, error: null });

    try {
      const connection = peerInstanceRef.current.connect(partnerId, {
        serialization: 'none',
        reliable: true
      });
      setupConnection(connection);
    } catch (e) {
      console.error('Error connecting to partner:', e);
      setState(prev => ({ ...prev, error: 'Failed to connect', connecting: false }));
    }
  }, [userId, partnerId, setupConnection]);

  // Initialize PeerJS instance when user ID becomes available
  useEffect(() => {
    if (userId && !peerInstanceRef.current) {
      initializePeerConnection();
    }
  }, [userId, initializePeerConnection]);

  // Auto-connect to partner when both IDs are available
  useEffect(() => {
    if (!userId || !partnerId || !isPaired) {
      return;
    }

    // Clear any pending connection attempts
    if (connectionAttemptRef.current) {
      clearTimeout(connectionAttemptRef.current);
    }

    // If already connected, nothing to do
    if (connectionRef.current && connectionRef.current.open) {
      console.log('Already connected to partner');
      return;
    }

    // Try to connect immediately
    connectToPartner();

    // Retry connection every 3 seconds if not connected
    connectionAttemptRef.current = setInterval(() => {
      if (!connectionRef.current || !connectionRef.current.open) {
        console.log('Attempting to reconnect to partner...');
        connectToPartner();
      }
    }, 3000);

    return () => {
      if (connectionAttemptRef.current) {
        clearTimeout(connectionAttemptRef.current);
      }
    };
  }, [userId, partnerId, isPaired, connectToPartner]);

  const disconnect = useCallback(() => {
    if (connectionRef.current) {
      connectionRef.current.close();
      connectionRef.current = null;
    }
    if (peerInstanceRef.current) {
      peerInstanceRef.current.disconnect();
      peerInstanceRef.current = null;
    }
    setState({ connected: false, connecting: false, error: null });
  }, []);

  useEffect(() => {
    return () => {
      if (connectionAttemptRef.current) {
        clearTimeout(connectionAttemptRef.current);
      }
      disconnect();
    };
  }, [disconnect]);

  return {
    state,
    send,
    disconnect,
  };
}
