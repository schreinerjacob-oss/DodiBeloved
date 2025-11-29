import { useEffect, useState, useCallback } from 'react';
import { useDodi } from '@/contexts/DodiContext';
import type { SyncMessage } from '@/types';
import Peer, { type DataConnection } from 'peerjs';

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
let currentPartnerId: string | null = null;
let globalState: PeerConnectionState = {
  connected: false,
  error: null,
  peerId: null,
  isReconnecting: false,
};

// Subscription system - track all active hook listeners
const listeners = new Set<(state: PeerConnectionState) => void>();

// Notify all listeners of state changes
function notifyListeners() {
  const newState: PeerConnectionState = {
    connected: !!globalConn && globalConn.open,
    error: globalState.error,
    peerId: globalPeer?.id || null,
    isReconnecting: globalPeer ? globalPeer.disconnected : false,
  };
  
  // Only notify if state actually changed
  if (
    newState.connected !== globalState.connected ||
    newState.peerId !== globalState.peerId ||
    newState.isReconnecting !== globalState.isReconnecting ||
    newState.error !== globalState.error
  ) {
    globalState = newState;
    console.log('🔄 Connection state updated:', newState);
    listeners.forEach(listener => listener(newState));
  }
}

// Connect to partner - called globally
function connectToPartner(targetId: string) {
  if (!globalPeer || globalPeer.destroyed) {
    console.warn('⚠️ Cannot connect: peer not ready');
    return;
  }
  if (globalConn && globalConn.open && globalConn.peer === targetId) {
    console.log('✅ Already connected to partner');
    return;
  }

  console.log('🔗 Dialing partner:', targetId);
  const conn = globalPeer.connect(targetId, {
    reliable: true,
    serialization: 'json',
  });
  setupConnection(conn, targetId);
}

// Setup data connection - called globally
function setupConnection(conn: DataConnection, partnerId: string) {
  if (globalConn && globalConn.open && globalConn.peer === conn.peer && globalConn !== conn) {
    conn.close();
    return;
  }

  globalConn = conn;

  conn.on('open', () => {
    console.log('✨ SECURE PIPE ESTABLISHED with:', conn.peer);
    globalState.error = null;
    notifyListeners();
    conn.send({ type: 'ping', timestamp: Date.now() });
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
    // Attempt reconnect after delay using stored partnerId
    if (partnerId) {
      setTimeout(() => connectToPartner(partnerId), 3000);
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
    // Set initial state immediately
    setState(globalState);
    return () => {
      listeners.delete(setState);
    };
  }, []);

  // 1. ESTABLISH PEER when userId and pairingStatus change
  useEffect(() => {
    if (pairingStatus !== 'connected' || !userId) return;
    
    if (globalPeer && !globalPeer.destroyed && globalPeer.id === userId) {
      console.log('✅ Peer already active');
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
      globalState.error = null;
      notifyListeners();
      if (currentPartnerId) connectToPartner(currentPartnerId);
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
      if (conn.peer === currentPartnerId) {
        setupConnection(conn, conn.peer);
      } else {
        console.warn('🚫 Blocked unknown peer:', conn.peer, 'expected:', currentPartnerId);
        conn.close();
      }
    });

    return () => {
      // Intentionally DO NOT destroy peer on unmount to keep connection alive
    };
  }, [userId, pairingStatus]);

  // 2. CONNECT TO PARTNER whenever partnerId changes
  useEffect(() => {
    currentPartnerId = partnerId || null;
    
    if (!partnerId || !globalPeer || globalPeer.destroyed) {
      console.log('⏳ Waiting for peer or partnerId:', { hasPeer: !!globalPeer, partnerId });
      return;
    }
    
    console.log('🔗 partnerId changed, connecting to:', partnerId);
    connectToPartner(partnerId);
  }, [partnerId]);

  const send = useCallback((message: SyncMessage) => {
    if (globalConn && globalConn.open) {
      globalConn.send(message);
      console.log('📤 Sent:', message.type);
    } else {
      console.warn('⚠️ Failed to send: Pipe broken');
      if (currentPartnerId) connectToPartner(currentPartnerId);
    }
  }, []);

  const reconnect = useCallback(() => {
    if (globalPeer && globalPeer.disconnected) {
      globalPeer.reconnect();
    } else if (currentPartnerId) {
      connectToPartner(currentPartnerId);
    }
    notifyListeners();
  }, []);

  // Periodic health check - ensure connection is active
  useEffect(() => {
    const interval = setInterval(() => {
      notifyListeners();
      if (!globalConn || !globalConn.open) {
        if (currentPartnerId) connectToPartner(currentPartnerId);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return { state, send, reconnect };
}
