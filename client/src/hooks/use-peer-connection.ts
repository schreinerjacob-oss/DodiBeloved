import { useEffect, useState, useCallback } from 'react';
import { useDodi } from '@/contexts/DodiContext';
import type { SyncMessage } from '@/types';
import Peer, { type DataConnection } from 'peerjs';
import { initializeBackgroundSync } from '@/lib/background-sync';
import { notifyConnectionRestored } from '@/lib/notifications';

interface PeerConnectionState {
  connected: boolean;
  error: string | null;
  peerId: string | null;
  isReconnecting: boolean;
}

interface UsePeerConnectionReturn {
  state: PeerConnectionState;
  send: (message: SyncMessage) => void;
  reconnect: () => void;
}

// Global singleton variables to persist across renders
let globalPeer: Peer | null = null;
let globalConn: DataConnection | null = null;
let globalPartnerId: string | null = null;
let globalState: PeerConnectionState = {
  connected: false,
  error: null,
  peerId: null,
  isReconnecting: false,
};

// Offline queue for P2P messages when disconnected
let offlineQueue: SyncMessage[] = [];
let queueFlushInProgress = false;

// Subscription system - track all active hook listeners
const listeners = new Set<(state: PeerConnectionState) => void>();
const queueListeners = new Set<(queueSize: number) => void>();

// Notify all listeners of state changes
function notifyListeners() {
  const newState: PeerConnectionState = {
    connected: !!globalConn && globalConn.open,
    error: globalState.error,
    peerId: globalPeer?.id || null,
    isReconnecting: globalPeer ? globalPeer.disconnected : false,
  };
  
  // Expose state globally for diagnostics panel
  (window as any).__DODI_PEER_STATE__ = {
    ...newState,
    queueSize: offlineQueue.length,
  };
  
  // Only notify if state actually changed
  if (
    newState.connected !== globalState.connected ||
    newState.peerId !== globalState.peerId ||
    newState.isReconnecting !== globalState.isReconnecting ||
    newState.error !== globalState.error
  ) {
    globalState = newState;
    listeners.forEach(listener => listener(newState));
  }
}

// Connect to partner - called globally
function connectToPartner(targetId: string) {
  if (!globalPeer || globalPeer.destroyed) return;
  if (globalConn && globalConn.open && globalConn.peer === targetId) return;

  console.log('🔗 Dialing partner:', targetId);
  const conn = globalPeer.connect(targetId, {
    reliable: true,
    serialization: 'json',
  });
  setupConnection(conn);
}

// Send a tiny wake-up signal via signaling server (Relay)
function sendWakeUpPing(partnerId: string) {
  if (!globalPeer || globalPeer.destroyed || globalPeer.disconnected) return;
  console.log('📡 Sending wake-up ping to partner via relay:', partnerId);
  
  // PeerJS relay (wss://0.peerjs.com) handles signal forwarding
  // We send a tiny data message that the peer server will try to deliver
  // if the partner's signaling connection is still alive but P2P is closed
  const conn = globalPeer.connect(partnerId, {
    reliable: false,
    label: 'wake-up-ping',
    metadata: { type: 'wake-up', senderId: globalPeer.id }
  });
  
  // Close after 5 seconds to avoid hanging connections
  setTimeout(() => conn.close(), 5000);
}

// Flush queued messages when connection restored
async function flushOfflineQueue(conn: DataConnection) {
  if (queueFlushInProgress || offlineQueue.length === 0) return;
  
  queueFlushInProgress = true;
  const queueSize = offlineQueue.length;
  console.log('🔄 Flushing offline queue:', queueSize, 'messages');
  
  const toSend = [...offlineQueue];
  offlineQueue = [];
  queueListeners.forEach(listener => listener(0));
  
  // Send all queued messages in batch
  for (const msg of toSend) {
    try {
      conn.send(msg);
      console.log('📤 Queued message sent:', msg.type);
    } catch (e) {
      console.error('Failed to send queued message:', e);
      offlineQueue.push(msg); // Re-queue if failed
    }
  }
  
  queueFlushInProgress = false;
  console.log('✅ Offline queue flushed');
  
  // Notify user that queued messages were delivered
  if (queueSize > 0) {
    notifyConnectionRestored();
  }
}

// Setup data connection - called globally
function setupConnection(conn: DataConnection) {
  if (globalConn && globalConn.open && globalConn.peer === conn.peer && globalConn !== conn) {
    conn.close();
    return;
  }

  globalConn = conn;

  conn.on('open', () => {
    console.log('✨ SECURE PIPE ESTABLISHED with:', conn.peer);
    notifyListeners();
    conn.send({ type: 'ping', timestamp: Date.now() });
    
    // FLUSH OFFLINE QUEUE when connection established
    if (offlineQueue.length > 0) {
      flushOfflineQueue(conn);
    }
  });

  conn.on('data', (data: any) => {
    console.log('📩 INCOMING:', data.type || 'unknown');
    if (data.type === 'ping') return;
    window.dispatchEvent(new CustomEvent('p2p-message', { detail: data }));
  });

  conn.on('close', () => {
    console.log('XY Connection lost');
    if (globalConn === conn) globalConn = null;
    notifyListeners();
    // Reconnect attempt via cached ID, no hooks inside
    if (globalPartnerId) {
      setTimeout(() => connectToPartner(globalPartnerId!), 3000);
    }
  });

  conn.on('error', (err) => {
    console.error('Connection Error:', err);
    if (globalConn === conn) globalConn = null;
    globalState.error = err.message;
    notifyListeners();
  });
}

export function usePeerConnection(): UsePeerConnectionReturn {
  const { userId, partnerId, pairingStatus } = useDodi();
  const [state, setState] = useState<PeerConnectionState>(globalState);

  // Subscribe to global state changes
  useEffect(() => {
    listeners.add(setState);
    return () => {
      listeners.delete(setState);
    };
  }, []);

  // 1. ESTABLISH PEER when userId and pairingStatus change
  useEffect(() => {
    if (pairingStatus !== 'connected' || !userId) return;
    
    if (globalPeer && !globalPeer.destroyed && globalPeer.id === userId) {
      if (globalPeer.disconnected) globalPeer.reconnect();
      notifyListeners();
      return;
    }

    if (globalPeer) globalPeer.destroy();

    console.log('🌐 Starting P2P Network Service for:', userId);
    
    const peer = new Peer(userId, {
      host: '0.peerjs.com',
      port: 443,
      secure: true,
      debug: 1,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' }
        ]
      }
    });

    globalPeer = peer;

    peer.on('open', (id) => {
      console.log('✅ My Peer ID is active:', id);
      notifyListeners();
      if (partnerId) connectToPartner(partnerId);
    });

    peer.on('error', (err) => {
      console.error('PeerJS Error:', err);
      globalState.error = err.type === 'unavailable-id' ? 'Connection conflict' : err.message;
      notifyListeners();
    });

    peer.on('disconnected', () => {
      console.log('📡 Disconnected from signaling server. Attempting reconnect...');
      notifyListeners();
      peer.reconnect();
    });

    peer.on('connection', (conn) => {
      console.log('📞 Incoming connection from:', conn.peer);
      if (conn.peer === partnerId) {
        setupConnection(conn);
      } else {
        console.warn('🚫 Blocked unknown peer:', conn.peer);
        conn.close();
      }
    });

    return () => {
      // Intentionally DO NOT destroy peer on unmount to keep connection alive
    };
  }, [userId, pairingStatus]);

  // 2. CONNECT TO PARTNER whenever partnerId changes
  useEffect(() => {
    if (partnerId) {
      globalPartnerId = partnerId;
    }
    if (!partnerId || !globalPeer || globalPeer.destroyed) return;
    
    console.log('🔗 partnerId changed, connecting to:', partnerId);
    connectToPartner(partnerId);
  }, [partnerId]);

  const send = useCallback((message: SyncMessage) => {
    if (globalConn && globalConn.open) {
      globalConn.send(message);
      console.log('📤 Sent:', message.type);
    } else {
      // Queue message for later when reconnected
      console.log('📨 Queueing message (offline):', message.type);
      offlineQueue.push(message);
      queueListeners.forEach(listener => listener(offlineQueue.length));
      if (partnerId) {
        connectToPartner(partnerId);
        sendWakeUpPing(partnerId);
      }
    }
  }, [partnerId]);

  const reconnect = useCallback(() => {
    if (globalPeer && globalPeer.disconnected) {
      globalPeer.reconnect();
    } else if (partnerId) {
      connectToPartner(partnerId);
    }
    notifyListeners();
  }, [partnerId]);

  // Periodic health check - ensure connection is active
  useEffect(() => {
    const interval = setInterval(() => {
      notifyListeners();
      if (!globalConn || !globalConn.open) {
        if (partnerId) connectToPartner(partnerId);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [partnerId]);

  // Initialize background sync for reconnection when app is backgrounded
  useEffect(() => {
    if (pairingStatus !== 'connected' || !partnerId) return;
    
    initializeBackgroundSync(() => {
      console.log('⏰ Background sync: attempting P2P reconnect');
      if (!globalConn || !globalConn.open) {
        connectToPartner(partnerId);
      }
    });
  }, [pairingStatus, partnerId]);

  // Subscribe to queue changes
  useEffect(() => {
    const queueStateHandler = (size: number) => {
      if (size > 0) {
        console.log('📨 Offline messages queued:', size);
      }
    };
    queueListeners.add(queueStateHandler);
    return () => { queueListeners.delete(queueStateHandler); };
  }, []);

  return { state, send, reconnect };
}
