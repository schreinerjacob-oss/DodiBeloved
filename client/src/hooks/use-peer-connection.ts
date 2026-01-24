import { useEffect, useState, useCallback } from 'react';
import { useDodi } from '@/contexts/DodiContext';
import type { SyncMessage } from '@/types';
import Peer, { type DataConnection } from 'peerjs';
import { initializeBackgroundSync } from '@/lib/background-sync';
import { notifyConnectionRestored } from '@/lib/notifications';
import { saveToOfflineQueue, getOfflineQueue, removeFromOfflineQueue, getOfflineQueueSize } from '@/lib/storage';
import { notifyQueueListeners } from '@/hooks/use-offline-queue';

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
let globalSyncInProgress = false;
let globalSyncCancelled = false;
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
  
  firstMessageSentAfterReconnect = null;
  clearReconnectTimeout();
  reconnectTimeout = setTimeout(() => {
    reconnectAttempt++;
    connectToPartner(globalPartnerId!);
  }, backoff);
}

// Offline queue for P2P messages when disconnected
let offlineQueue: SyncMessage[] = [];
let queueFlushInProgress = false;
let persistentQueueLoaded = false;

// Subscription system - track all active hook listeners
const listeners = new Set<(state: PeerConnectionState) => void>();

// Load persistent queue on startup
async function loadPersistentQueue() {
  if (persistentQueueLoaded) return;
  persistentQueueLoaded = true;
  
  try {
    const items = await getOfflineQueue();
    if (items.length > 0) {
      console.log('📥 Loaded', items.length, 'messages from persistent queue');
      offlineQueue = items.map(item => item.message as SyncMessage);
      notifyQueueListeners(offlineQueue.length);
    } else {
      // Sync queue size from storage to ensure consistency
      const size = await getOfflineQueueSize();
      notifyQueueListeners(size);
    }
  } catch (e) {
    console.warn('Failed to load persistent queue:', e);
    // Try to at least get the count for UI
    try {
      const size = await getOfflineQueueSize();
      notifyQueueListeners(size);
    } catch {
      notifyQueueListeners(0);
    }
  }
}

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
  // We send a connection request with metadata that acts as a ping
  const conn = globalPeer.connect(partnerId, {
    reliable: false,
    label: 'wake-up-ping',
    metadata: { type: 'wake-up', senderId: globalPeer.id }
  });
  
  conn.on('open', () => {
    console.log('✅ Wake-up ping sent via relay');
    conn.close();
  });

  // Ensure relay connection closes even if open event doesn't fire
  setTimeout(() => {
    if (conn.open) {
      console.log('✅ Wake-up ping sent (timed close)');
      conn.close();
    }
  }, 2000);
}

// Flush queued messages when connection restored
async function flushOfflineQueue(conn: DataConnection) {
  if (queueFlushInProgress || offlineQueue.length === 0) return;
  
  queueFlushInProgress = true;
  const queueSize = offlineQueue.length;
  console.log('🔄 Flushing offline queue:', queueSize, 'messages');
  
  const toSend = [...offlineQueue];
  const sentIds: string[] = [];
  let failedCount = 0;
  
  // Send messages one by one and remove from persistent storage only after success
  for (const msg of toSend) {
    const msgId = (msg.data as any)?.id;
    if (!msgId) continue;
    
    try {
      conn.send(msg);
      console.log('📤 Queued message sent:', msg.type, msgId);
      sentIds.push(msgId);
      
      // Remove from persistent storage after successful send
      await removeFromOfflineQueue(msgId);
      
      // Remove from memory queue
      const idx = offlineQueue.findIndex(m => (m.data as any)?.id === msgId);
      if (idx !== -1) offlineQueue.splice(idx, 1);
    } catch (e) {
      console.error('Failed to send queued message:', e);
      failedCount++;
      // Keep in both memory and persistent queue for retry
    }
  }
  
  notifyQueueListeners(offlineQueue.length);
  queueFlushInProgress = false;
  console.log(`✅ Offline queue flushed: ${sentIds.length} sent, ${failedCount} failed`);
  
  // Notify user that queued messages were delivered
  if (sentIds.length > 0) {
    notifyConnectionRestored();
  }
}

// Setup data connection - called globally
function setupConnection(conn: DataConnection) {
  // If we already have an open connection to the same peer, don't overwrite it
  // unless the new one is actually open and the old one isn't.
  if (globalConn && globalConn.open && globalConn.peer === conn.peer && globalConn !== conn) {
    console.log('🚫 Connection already open for', conn.peer, '- closing redundant connection');
    conn.close();
    return;
  }

  // Update globalConn BEFORE adding listeners to ensure 'open' event can use it
  globalConn = conn;

  async function handleReconcileInit(conn: DataConnection, partnerTimestamps: any) {
    try {
      const { getItemsSince } = await import('@/lib/storage-encrypted');
      const stores = ['messages', 'memories', 'calendarEvents', 'dailyRituals', 'loveLetters', 'futureLetters', 'prayers', 'reactions'] as const;
      const batch: any[] = [];

      for (const storeName of stores) {
        const remoteLastSynced = partnerTimestamps[storeName] || 0;
        const localNewItems = await getItemsSince(storeName, remoteLastSynced);
        localNewItems.forEach(item => {
          batch.push({ store: storeName, data: item, timestamp: item.updatedAt || item.timestamp || Date.now() });
        });
      }

      if (batch.length > 0) {
        console.log('📤 Sending reconciliation batch:', batch.length);
        conn.send({ type: 'reconcile-data', batch });
      } else {
        console.log('✨ [SYNC] No new items to sync to partner.');
      }
    } catch (e) {
      console.error('Reconciliation push failed:', e);
    }
  }

  async function handleReconcileData(batch: any[]) {
    console.log('📥 Processing reconciliation batch:', batch.length);
    const { setLastSynced, saveIncomingItems } = await import('@/lib/storage-encrypted');
    
    const itemsByStore: Record<string, any[]> = {};
    for (const item of batch) {
      if (!itemsByStore[item.store]) itemsByStore[item.store] = [];
      itemsByStore[item.store].push(item.data);
    }

    let totalApplied = 0;
    for (const [storeName, items] of Object.entries(itemsByStore)) {
      try {
        await saveIncomingItems(storeName as any, items);
        totalApplied += items.length;
        const newest = Math.max(...batch.filter(b => b.store === storeName).map(b => Number(b.timestamp)));
        if (newest > 0) {
          await setLastSynced(storeName, newest);
        }
      } catch (e) {
        console.error(`Failed to save reconciled items for ${storeName}:`, e);
      }
    }
    
    console.log(`✅ Reconciled ${totalApplied} items from partner since last sync`);
    globalSyncInProgress = false;
    window.dispatchEvent(new CustomEvent('reconciliation-complete', { detail: { count: totalApplied } }));
    import('@/lib/queryClient').then(({ queryClient }) => queryClient.invalidateQueries());
  }

  conn.on('open', async () => {
    console.log('✨ Persistent Direct P2P connection established with:', conn.peer);
    reconnectAttempt = 0;
    globalSyncCancelled = false; // Reset cancellation on new connection
    clearReconnectTimeout();
    startHealthCheck(conn);
    notifyListeners();
    conn.send({ type: 'ping', timestamp: Date.now() });
    
    // START RECONCILIATION
    try {
      const { getLastSynced, getBatchForRestore } = await import('@/lib/storage-encrypted');
      const stores = ['messages', 'memories', 'calendarEvents', 'dailyRituals', 'loveLetters', 'futureLetters', 'prayers', 'reactions'] as const;
      const lastSyncedTimestamps: Record<string, number> = {};
      for (const store of stores) {
        lastSyncedTimestamps[store] = await getLastSynced(store);
      }
      console.log('📡 Initiating reconciliation with timestamps:', lastSyncedTimestamps);
      conn.send({ type: 'reconcile-init', timestamps: lastSyncedTimestamps });

      // PHASE 2: Check for older data to sync in background
      const batch = await getBatchForRestore(stores, lastSyncedTimestamps, 50);
      if (batch.length > 0) {
        console.log('🔄 [RESTORE] Queueing background batch sync for older data...');
        setTimeout(() => {
          if (conn.open) {
            conn.send({ type: 'restore-batch-init', timestamps: lastSyncedTimestamps });
          }
        }, 1000);
      }
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
    
    if (data.timestamp && firstMessageSentAfterReconnect) {
      const latency = Date.now() - firstMessageSentAfterReconnect;
      console.log(`⏱️ [LATENCY] First message after reconnect: ${latency}ms`);
      firstMessageSentAfterReconnect = null;
    }

    if (data.type === 'ping') {
      conn.send({ type: 'pong', timestamp: Date.now() });
      // Notify listeners to ensure UI reflects 'connected' status immediately
      notifyListeners();
      return;
    }
    if (data.type === 'pong') {
      console.log('✅ Pong received - connection healthy');
      lastPongReceived = Date.now();
      // Notify listeners to ensure UI reflects 'connected' status immediately
      notifyListeners();
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

    if (data.type === 'restore-key') {
      console.log('♾️ [RESTORE] Master key received via restoration tunnel');
      
      let payload = data;
      // If encrypted, decrypt first
      if (data.encrypted && data.iv) {
        console.log('🔓 [RESTORE] Decrypting restoration payload...');
        // We need the shared key from the tunnel handshake
        // In the current architecture, the tunnel handshake is handled in pairing.tsx
        // but the message comes here. We dispatch the event and let pairing.tsx handle it.
      }
      
      window.dispatchEvent(new CustomEvent('dodi-restore-payload', { detail: payload }));
      return;
    }

    if (data.type === 'restore-batch-init') {
      const { getBatchForRestore } = await import('@/lib/storage-encrypted');
      const stores = ['messages', 'memories', 'calendarEvents', 'dailyRituals', 'loveLetters', 'futureLetters', 'prayers', 'reactions'] as const;
      
      const processNextBatch = async () => {
        const batch = await getBatchForRestore(stores, data.timestamps, 50);
        if (batch.length > 0) {
          console.log('📤 Sending older data batch:', batch.length);
          conn.send({ type: 'restore-batch-data', batch, timestamps: data.timestamps });
        } else {
          console.log('✅ Background restoration complete');
          conn.send({ type: 'restore-batch-complete' });
        }
      };
      
      await processNextBatch();
      return;
    }

    if (data.type === 'restore-batch-data') {
      if (globalSyncCancelled) {
        console.log('🛑 [SYNC] Restore batch ignored due to cancellation');
        return;
      }
      console.log('📥 Processing older data batch:', data.batch.length);
      const { saveIncomingItems } = await import('@/lib/storage-encrypted');
      
      const itemsByStore: Record<string, any[]> = {};
      for (const item of data.batch) {
        if (!itemsByStore[item.store]) itemsByStore[item.store] = [];
        itemsByStore[item.store].push(item.data);
      }

      for (const [storeName, items] of Object.entries(itemsByStore)) {
        await saveIncomingItems(storeName as any, items);
      }
      
      window.dispatchEvent(new CustomEvent('dodi-sync-batch', { detail: { count: data.batch.length } }));
      
      // Request next batch after 500ms delay, unless cancelled
      setTimeout(() => {
        if (conn.open && !globalSyncCancelled) {
          conn.send({ type: 'restore-batch-init', timestamps: data.timestamps });
        } else if (globalSyncCancelled) {
          console.log('🛑 [SYNC] Batch request skipped due to cancellation');
        }
      }, 500);
      return;
    }

    if (data.type === 'restore-batch-complete') {
      window.dispatchEvent(new CustomEvent('dodi-sync-complete'));
      import('@/hooks/use-toast').then(({ toast }) => {
        toast({
          title: "The garden is fully restored ♾️",
          description: "Your entire shared history has been synchronized.",
        });
      });
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

export interface RoomConnection {
  peer: Peer;
  conn: DataConnection;
  isCreator: boolean;
  peerId: string;
}

export async function initializePeer(id: string): Promise<Peer> {
  return new Promise((resolve, reject) => {
    const peer = new Peer(id, {
      host: '0.peerjs.com',
      port: 443,
      secure: true,
      debug: 1
    });
    peer.on('open', () => resolve(peer));
    peer.on('error', reject);
  });
}

export function createRoomPeerId(code: string, isCreator: boolean): string {
  const normalized = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return `dodi-room-${normalized}-${isCreator ? 'creator' : 'joiner'}`;
}

export function getRemotePeerId(code: string, isCreator: boolean): string {
  return createRoomPeerId(code, !isCreator);
}

export async function waitForConnection(peer: Peer, timeout: number): Promise<DataConnection> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Connection timed out')), timeout);
    peer.on('connection', (conn) => {
      clearTimeout(t);
      resolve(conn);
    });
  });
}

export async function connectToRoom(peer: Peer, remoteId: string, timeout: number): Promise<DataConnection> {
  return new Promise((resolve, reject) => {
    console.log(`📡 [P2P] Attempting to connect to remote peer: ${remoteId}`);
    // Explicitly set serialization for consistency
    const conn = peer.connect(remoteId, {
      reliable: true,
      serialization: 'json'
    });
    
    const t = setTimeout(() => {
      if (!conn.open) {
        console.warn(`⚠️ [P2P] Connection to ${remoteId} timed out after ${timeout}ms`);
        conn.close();
        reject(new Error('Connection timed out. Please check if your partner is ready.'));
      }
    }, timeout);

    conn.on('open', () => {
      clearTimeout(t);
      console.log('✅ [P2P] Connection opened with remote peer');
      resolve(conn);
    });

    conn.on('error', (err) => {
      clearTimeout(t);
      console.error('❌ [P2P] Connection error:', err);
      reject(err);
    });
  });
}

export function closeRoom(room: RoomConnection) {
  room.conn.close();
  room.peer.destroy();
}

// Send a message or queue it if offline
export async function sendP2PMessage(message: SyncMessage) {
  if (globalConn && globalConn.open) {
    try {
      globalConn.send(message);
      console.log('📤 Message sent via P2P:', message.type);
      return;
    } catch (e) {
      console.error('Failed to send message, queuing instead:', e);
    }
  }

  // Queue the message if offline or send failed
  const msgId = (message.data as any)?.id || `msg-${Date.now()}`;
  console.log('📥 Connection offline, queuing message:', msgId);
  
  // Check for duplicates in memory queue
  if (!offlineQueue.some(m => (m.data as any)?.id === msgId)) {
    offlineQueue.push(message);
    await saveToOfflineQueue(msgId, message);
    notifyQueueListeners(offlineQueue.length);
  }
  
  // Trigger reconnection if offline
  if (globalPartnerId && (!globalConn || !globalConn.open)) {
    connectToPartner(globalPartnerId);
  }
}

export function usePeerConnection(): UsePeerConnectionReturn {
  const { userId, partnerId, pairingStatus, allowWakeUp } = useDodi();
  const [state, setState] = useState<PeerConnectionState>(globalState);

  // Subscribe to global state changes
  useEffect(() => {
    listeners.add(setState);
    return () => {
      listeners.delete(setState);
    };
  }, []);

  // Load persistent queue on mount
  useEffect(() => {
    loadPersistentQueue();
  }, []);

  // 1. ESTABLISH PEER when userId and pairingStatus change
  useEffect(() => {
    if (pairingStatus !== 'connected' || !userId) {
      if (globalPeer) {
        console.log('🛑 [P2P] Destroying peer due to disconnection or logout');
        globalPeer.destroy();
        globalPeer = null;
        globalConn = null;
        notifyListeners();
      }
      return;
    }
    
    if (globalPeer && !globalPeer.destroyed && globalPeer.id === userId) {
      if (globalPeer.disconnected) globalPeer.reconnect();
      notifyListeners();
      return;
    }

    if (globalPeer) globalPeer.destroy();

    console.log('🌐 Starting Private P2P Network Service (No Servers) for:', userId);
    console.log('📡 Direct device-to-device handshake started');
    
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
      // Immediately notify listeners to update globalState with the active peerId
      notifyListeners();
      if (partnerId) connectToPartner(partnerId);
    });

  peer.on('error', (err) => {
    console.error('PeerJS Error:', err);
    
    // Critical self-healing for ID conflicts or network issues
    if (err.type === 'unavailable-id' || err.type === 'network' || err.type === 'server-error') {
      console.log('🔄 Peer error detected, rebuilding peer in 5s...');
      setTimeout(() => {
        if (!peer.destroyed) {
          peer.destroy();
          // The useEffect dependency on globalPeer state will trigger a rebuild
          // if we force a re-render or global state change
          notifyListeners();
        }
      }, 5000);
    }
    
    globalState.error = err.type === 'unavailable-id' ? 'Connection conflict' : err.message;
    notifyListeners();
  });

    peer.on('disconnected', () => {
      console.log('📡 Disconnected from signaling server. Attempting reconnect...');
      notifyListeners();
      
      // Attempt reconnection
      peer.reconnect();
      
      // If reconnection doesn't happen within 10s, destroy and let the effect rebuild
      setTimeout(() => {
        if (peer.disconnected && !peer.destroyed) {
          console.log('🔄 Reconnect timed out, rebuilding peer...');
          peer.destroy();
          notifyListeners();
        }
      }, 10000);
    });

    peer.on('connection', (conn) => {
      console.log('📞 Incoming connection from:', conn.peer);
      
      // Handle wake-up ping
      if (conn.metadata?.type === 'wake-up') {
        console.log('⚡ Received wake-up ping from partner. Reconnecting...');
        if (!globalConn || !globalConn.open) {
          console.log('🌱 Reconnected direct after ping');
          connectToPartner(conn.peer);
        } else {
          // Even if we think we are open, partner thinks we aren't.
          // Send a ping to verify and trigger a pong back to them.
          globalConn.send({ type: 'ping', timestamp: Date.now() });
        }
        conn.close();
        return;
      }

      if (conn.peer === partnerId) {
        // If we have an existing open connection to this peer, don't replace it unless it's the same object
        if (globalConn && globalConn.open && globalConn.peer === conn.peer) {
          console.log('♻️ Reusing existing open connection for:', conn.peer);
          conn.close();
          return;
        }
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

  const send = useCallback(async (message: SyncMessage) => {
    console.log('📤 [P2P] Attempting to send message:', message.type);
    sendP2PMessage(message);
    if (!globalConn || !globalConn.open) {
      if (partnerId) {
        console.log('📡 [P2P] Device offline, triggered background connect');
        connectToPartner(partnerId);
        if (allowWakeUp) {
          sendWakeUpPing(partnerId);
        }
      }
    }
  }, [partnerId, allowWakeUp]);

  const reconnect = useCallback(() => {
    if (globalPeer && globalPeer.disconnected) {
      globalPeer.reconnect();
    } else if (partnerId) {
      connectToPartner(partnerId);
    }
    notifyListeners();
  }, [partnerId]);

  // Handle sync cancellation
  useEffect(() => {
    const handleCancel = () => {
      console.log('🛑 [SYNC] Global sync cancellation requested');
      globalSyncCancelled = true;
      globalSyncInProgress = false;
    };
    window.addEventListener('dodi-cancel-sync', handleCancel);
    return () => window.removeEventListener('dodi-cancel-sync', handleCancel);
  }, []);

  // Periodic health check - ensure connection is active
  useEffect(() => {
    const checkInterval = allowWakeUp ? 5000 : 30 * 60 * 1000;
    const interval = setInterval(() => {
      notifyListeners();
      if (!globalConn || !globalConn.open) {
        if (partnerId) {
          console.log(`📡 [${allowWakeUp ? 'ACTIVE' : 'POLLING'}] Attempting P2P connection...`);
          connectToPartner(partnerId);
        }
      }
    }, checkInterval);
    return () => clearInterval(interval);
  }, [partnerId, allowWakeUp]);

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

  return { state, send, reconnect };
}
