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

// Reconnection backoff state
let reconnectAttempt = 0;
let reconnectTimeout: NodeJS.Timeout | null = null;
let healthCheckInterval: NodeJS.Timeout | null = null;
let lastPongReceived = Date.now();
let firstMessageSentAfterReconnect: number | null = null;
const MAX_BACKOFF = 30000;
const PING_INTERVAL = 15000;
const PONG_TIMEOUT = 30000;

function clearReconnectTimeout() {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
}

function clearHealthCheck() {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }
}

function startHealthCheck(conn: DataConnection) {
  clearHealthCheck();
  lastPongReceived = Date.now();
  
  healthCheckInterval = setInterval(() => {
    if (conn.open) {
      console.log('📡 Sending health check ping...');
      conn.send({ type: 'ping', timestamp: Date.now() });
      
      const timeSinceLastPong = Date.now() - lastPongReceived;
      if (timeSinceLastPong > PONG_TIMEOUT) {
        console.warn('⚠️ No pong received in 30s - triggering reconnect');
        conn.close();
        startReconnecting();
      }
    } else {
      clearHealthCheck();
    }
  }, PING_INTERVAL);
}

function startReconnecting() {
  if (!globalPartnerId || (globalConn && globalConn.open)) {
    reconnectAttempt = 0;
    clearReconnectTimeout();
    return;
  }

  const backoff = Math.min(Math.pow(2, reconnectAttempt) * 1000, MAX_BACKOFF);
  console.log(`📡 Reconnecting in ${backoff / 1000} seconds (Attempt ${reconnectAttempt + 1})`);
  
  clearReconnectTimeout();
  reconnectTimeout = setTimeout(() => {
    reconnectAttempt++;
    connectToPartner(globalPartnerId!);
  }, backoff);
}

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

  async function handleReconcileInit(conn: DataConnection, partnerTimestamps: any) {
    try {
      const { getAllMessages, getAllMemories, getAllPrayers, getAllLoveLetters } = await import('@/lib/storage-encrypted');
      const batch: SyncMessage[] = [];

      // Fetch missing chat
      const messages = await getAllMessages();
      messages.filter((m: any) => Number(m.timestamp) > (partnerTimestamps.chat || 0))
              .forEach((m: any) => batch.push({ type: 'chat', data: m, timestamp: Number(m.timestamp) }));

      // Fetch missing memories
      const memories = await getAllMemories();
      memories.filter((m: any) => Number(m.timestamp) > (partnerTimestamps.memories || 0))
              .forEach((m: any) => batch.push({ type: 'memory', data: m, timestamp: Number(m.timestamp) }));

      // Fetch missing prayers
      const prayers = await getAllPrayers();
      prayers.filter((p: any) => Number(p.timestamp || 0) > (partnerTimestamps.prayers || 0))
              .forEach((p: any) => batch.push({ type: 'prayer', data: p, timestamp: Number(p.timestamp || 0) }));

      // Fetch missing letters
      const letters = await getAllLoveLetters();
      letters.filter((l: any) => Number(l.timestamp || 0) > (partnerTimestamps.letters || 0))
             .forEach((l: any) => batch.push({ type: 'love_letter', data: l, timestamp: Number(l.timestamp || 0) }));

      if (batch.length > 0) {
        console.log('📤 Sending reconciliation batch:', batch.length);
        conn.send({ type: 'reconcile-data', batch });
      }
    } catch (e) {
      console.error('Reconciliation push failed:', e);
    }
  }

  async function handleReconcileData(batch: SyncMessage[]) {
    console.log('📥 Processing reconciliation batch:', batch.length);
    for (const msg of batch) {
      window.dispatchEvent(new CustomEvent('p2p-message', { detail: msg }));
    }
    // Update lastSynced for each category based on batch
    const { setLastSynced } = await import('@/lib/storage-encrypted');
    const categories = ['chat', 'memory', 'prayer', 'love_letter'];
    for (const cat of categories) {
      const catMsgs = batch.filter(m => m.type === cat);
      if (catMsgs.length > 0) {
        const newest = Math.max(...catMsgs.map(m => Number((m.data as any).timestamp)));
        const storeKey = cat === 'memory' ? 'memories' : cat === 'love_letter' ? 'letters' : cat === 'prayer' ? 'prayers' : 'chat';
        await setLastSynced(storeKey, newest);
      }
    }
    
    if (batch.length > 0) {
      // Note: useToast is a hook, but we are in a non-component function. 
      // We'll use a custom event or log for now as requested.
      console.log(`✅ Reconciled ${batch.length} missing items from partner`);
      window.dispatchEvent(new CustomEvent('reconciliation-complete', { detail: { count: batch.length } }));
    }
  }

  conn.on('open', async () => {
    console.log('✨ Persistent P2P connection established with:', conn.peer);
    reconnectAttempt = 0;
    clearReconnectTimeout();
    startHealthCheck(conn);
    notifyListeners();
    conn.send({ type: 'ping', timestamp: Date.now() });
    
    // START RECONCILIATION
    try {
      const { getLastSynced } = await import('@/lib/storage-encrypted');
      const lastSyncedTimestamps = {
        chat: await getLastSynced('chat'),
        memories: await getLastSynced('memories'),
        prayers: await getLastSynced('prayers'),
        letters: await getLastSynced('letters'),
      };
      conn.send({ type: 'reconcile-init', timestamps: lastSyncedTimestamps });
    } catch (e) {
      console.error('Failed to initiate reconciliation:', e);
    }
    
    // FLUSH OFFLINE QUEUE when connection established
    if (offlineQueue.length > 0) {
      flushOfflineQueue(conn);
    }
  });

  conn.on('data', async (data: any) => {
    console.log('📩 INCOMING:', data.type || 'unknown');
    if (data.type === 'ping') {
      conn.send({ type: 'pong', timestamp: Date.now() });
      return;
    }
    if (data.type === 'pong') {
      console.log('✅ Pong received - connection healthy');
      lastPongReceived = Date.now();
      return;
    }

    // Handle Reconciliation Protocol
    if (data.type === 'reconcile-init') {
      await handleReconcileInit(conn, data.timestamps);
      return;
    }
    if (data.type === 'reconcile-data') {
      await handleReconcileData(data.batch);
      return;
    }

    window.dispatchEvent(new CustomEvent('p2p-message', { detail: data }));
  });

  conn.on('close', () => {
    console.log('XY Connection lost');
    if (globalConn === conn) globalConn = null;
    clearHealthCheck();
    notifyListeners();
    // Reconnect attempt with exponential backoff
    startReconnecting();
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
    console.log('📡 ICE gathering started');
    
    const peer = new Peer(userId, {
      host: '0.peerjs.com',
      port: 443,
      secure: true,
      debug: 1,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun.stunprotocol.org:3478' },
          { urls: 'stun:global.stun.twilio.com:3478' }
        ],
        iceTransportPolicy: 'all',
        iceCandidatePoolSize: 10
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
