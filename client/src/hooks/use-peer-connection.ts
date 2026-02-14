import { useEffect, useState, useCallback, useRef } from 'react';
import { useDodi } from '@/contexts/DodiContext';
import type { SyncMessage } from '@/types';
import Peer, { type DataConnection } from 'peerjs';
import { initializeBackgroundSync } from '@/lib/background-sync';
import { notifyConnectionRestored } from '@/lib/notifications';
import { saveToOfflineQueue, getOfflineQueue, removeFromOfflineQueue, getOfflineQueueSize, clearOfflineQueue, getMediaBlob, saveToOfflineMediaQueue, getOfflineMediaQueue, removeFromOfflineMediaQueue, saveMediaBlob, isInOfflineMediaQueue, type MediaVariant } from '@/lib/storage';
import { notifyQueueListeners, useOfflineQueueSize } from '@/hooks/use-offline-queue';
import { getNotifyServerUrl } from '@/lib/push-register';
import { getPartnerPushToken } from '@/lib/push-token';

interface PeerConnectionState {
  connected: boolean;
  error: string | null;
  peerId: string | null;
  isReconnecting: boolean;
}

interface UsePeerConnectionReturn {
  state: PeerConnectionState;
  send: (message: SyncMessage) => void;
  sendMedia: (args: { mediaId: string; kind: 'message' | 'memory'; mime: string; variant?: MediaVariant; blob?: Blob }) => Promise<void>;
  /** Normal: reconnect signaling or dial partner. force=true: full re-init (like refresh). */
  reconnect: (force?: boolean) => void;
}

// Global singleton variables to persist across renders
let globalPeer: Peer | null = null;
let globalConn: DataConnection | null = null;
let globalMediaConn: DataConnection | null = null;
let globalPartnerId: string | null = null;
/** Set by hook so sendP2PMessage can trigger wake-up ping as soon as message is queued. */
let globalAllowWakeUp = false;
/** Throttle: at most one notify per partner per 45s. */
const NOTIFY_THROTTLE_MS = 45 * 1000;
let lastNotifyAt = 0;
let globalSyncInProgress = false;
let globalSyncCancelled = false;
let globalState: PeerConnectionState = {
  connected: false,
  error: null,
  peerId: null,
  isReconnecting: false,
};

// Set of callbacks so every usePeerConnection instance gets notified when peer is destroyed
const onPeerDestroyedListeners = new Set<() => void>();

// Stored peer event handlers so we can remove them before destroy (avoids duplicate listeners on re-run)
let currentPeerHandlers: {
  open: (id: string) => void;
  error: (err: unknown) => void;
  disconnected: () => void;
  connection: (conn: DataConnection) => void;
} | null = null;

function removePeerListeners(peer: Peer | null): void {
  if (!peer || !currentPeerHandlers) return;
  peer.off('open', currentPeerHandlers.open);
  peer.off('error', currentPeerHandlers.error);
  peer.off('disconnected', currentPeerHandlers.disconnected);
  peer.off('connection', currentPeerHandlers.connection);
  currentPeerHandlers = null;
}

let disconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;

// Reconnection backoff state
let reconnectAttempt = 0;
let reconnectTimeout: NodeJS.Timeout | null = null;
let healthCheckInterval: NodeJS.Timeout | null = null;
let lastPongReceived = Date.now();
let firstMessageSentAfterReconnect: number | null = null;
let reconnectStartedAt: number | null = null;
const MAX_BACKOFF = 15000;
const PING_INTERVAL = 5000;       // Keep-alive ping every 5s (faster dead-connection detection)
const PONG_TIMEOUT = 15000;       // Trigger reconnect if no pong in 15s
const AGGRESSIVE_RECONNECT_INTERVAL = 5000;

let aggressiveReconnectInterval: NodeJS.Timeout | null = null;
let aggressiveReconnectStartedAt: number | null = null;

/** After tab becomes visible, suppress "Reconnecting" for this long so we don't flash it if signaling reconnects quickly. */
const VISIBILITY_RECONNECT_GRACE_MS = 2000;
let visibilityGraceUntil = 0;

function clearAggressiveReconnect() {
  if (aggressiveReconnectInterval) {
    clearInterval(aggressiveReconnectInterval);
    aggressiveReconnectInterval = null;
  }
  aggressiveReconnectStartedAt = null;
}

function startAggressiveReconnect() {
  if (aggressiveReconnectInterval) return;
  aggressiveReconnectStartedAt = Date.now();
  console.log('💓 [P2P] Starting aggressive reconnect heartbeat');
  aggressiveReconnectInterval = setInterval(() => {
    if (globalConn && globalConn.open) {
      clearAggressiveReconnect();
      return;
    }
    if (!globalPartnerId) return;
    // After 30s of failed reconnect, force full peer re-init (like refresh)
    if (aggressiveReconnectStartedAt != null && Date.now() - aggressiveReconnectStartedAt > 30000) {
      console.log('🔄 [P2P] Reconnect stuck 30s - forcing full peer re-init (like refresh)');
      clearAggressiveReconnect();
      // Always clear reconnecting state and notify so UI does not stay stuck
      reconnectAttempt = 0;
      reconnectStartedAt = null;
      clearReconnectTimeout();
      clearHealthCheck();
      if (globalPeer) {
        removePeerListeners(globalPeer);
        globalPeer.destroy();
        globalPeer = null;
        globalConn = null;
        globalMediaConn = null;
        onPeerDestroyedListeners.forEach((cb) => cb());
      }
      notifyListeners();
      return;
    }
    console.log('💓 [P2P] Aggressive reconnect heartbeat...');
    connectToPartner(globalPartnerId);
  }, AGGRESSIVE_RECONNECT_INTERVAL);
}

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
        console.warn('⚠️ No pong received - triggering reconnect');
        conn.close();
        startReconnecting();
      }
    } else {
      clearHealthCheck();
    }
  }, PING_INTERVAL);
}

// Treat connection as dead if we haven't received a pong in PONG_TIMEOUT (zombie connection)
function isConnectionLikelyDead(): boolean {
  if (!globalConn || !globalConn.open) return false;
  return Date.now() - lastPongReceived > PONG_TIMEOUT;
}

function startReconnecting() {
  if (!globalPartnerId) {
    reconnectAttempt = 0;
    clearReconnectTimeout();
    return;
  }
  // If we think we're connected but no pong in a long time, treat as dead and proceed
  if (globalConn && globalConn.open && !isConnectionLikelyDead()) {
    reconnectAttempt = 0;
    clearReconnectTimeout();
    return;
  }
  if (globalConn && isConnectionLikelyDead()) {
    console.warn('⚠️ [P2P] Stale connection (no pong) - closing and reconnecting');
    globalConn.close();
    globalConn = null;
    clearHealthCheck();
  }

  if (reconnectStartedAt == null) {
    reconnectStartedAt = Date.now();
  }

  // Also start aggressive polling
  startAggressiveReconnect();
  notifyListeners(); // So UI shows "Reconnecting" immediately

  const backoff = Math.min(Math.pow(2, reconnectAttempt) * 1000, MAX_BACKOFF);
  console.log(`📡 Reconnecting in ${backoff / 1000}s (Attempt ${reconnectAttempt + 1}) [backoff: 1s→2s→4s→8s…]`);
  
  firstMessageSentAfterReconnect = null;
  clearReconnectTimeout();
  reconnectTimeout = setTimeout(() => {
    reconnectAttempt++;
    // partnerId may have become null since scheduling; skip if no partner
    if (!globalPartnerId) return;
    connectToPartner(globalPartnerId);
  }, backoff);
}

// Offline queue for P2P messages when disconnected
let offlineQueue: SyncMessage[] = [];
/** Partner ID for whom the queue was built; null = unknown (e.g. loaded from persistence). */
let queueIntendedForPartnerId: string | null = null;
let queueFlushInProgress = false;
let persistentQueueLoaded = false;

let mediaFlushInProgress = false;
const MEDIA_CHUNK_SIZE = 64 * 1024; // 64KB chunks for broad WebRTC compatibility
const MEDIA_RESEND_COOLDOWN_MS = 15_000;
const inFlightMedia = new Map<string, number>(); // mediaId -> lastSentAt
const incomingMedia = new Map<
  string,
  { kind: 'message' | 'memory'; mime: string; variant: MediaVariant; totalChunks: number; received: number; chunks: ArrayBuffer[] }
>();

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
  const rawReconnecting = !!(globalPeer?.disconnected || reconnectStartedAt != null || aggressiveReconnectInterval);
  // Right after tab becomes visible, only show "Reconnecting" if we're actively trying (backoff/aggressive), not just signaling disconnected—avoids flash when connection recovers quickly.
  const inGracePeriod = Date.now() < visibilityGraceUntil;
  const onlySignalingDown = rawReconnecting && !reconnectStartedAt && !aggressiveReconnectInterval;
  const isReconnecting = rawReconnecting && (!inGracePeriod || !onlySignalingDown);

  const newState: PeerConnectionState = {
    connected: !!globalConn && globalConn.open,
    error: globalState.error,
    peerId: globalPeer?.id || null,
    isReconnecting,
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
  if (!targetId || !globalPeer || globalPeer.destroyed) return;
  // If we think we're connected to this partner and connection is healthy, skip
  if (globalConn && globalConn.open && globalConn.peer === targetId && !isConnectionLikelyDead()) return;
  // Stale connection (no pong) - close and replace with fresh attempt
  if (globalConn && globalConn.peer === targetId && isConnectionLikelyDead()) {
    console.warn('⚠️ [P2P] Stale connection to partner - closing and re-dialing');
    globalConn.close();
    globalConn = null;
    clearHealthCheck();
  }

  globalPartnerId = targetId;
  console.log('🔗 Dialing partner:', targetId);
  const conn = globalPeer.connect(targetId, {
    reliable: true,
    serialization: 'json',
    label: 'main',
  });
  setupConnection(conn);

  // Separate binary channel for media blobs (ArrayBuffer chunks)
  const mediaConn = globalPeer.connect(targetId, {
    reliable: true,
    serialization: 'binary',
    label: 'media',
  });
  setupMediaConnection(mediaConn);
}

async function flushOfflineMediaQueue() {
  if (mediaFlushInProgress) return;
  if (!globalMediaConn || !globalMediaConn.open) return;

  mediaFlushInProgress = true;
  try {
    const queued = await getOfflineMediaQueue();
    if (queued.length === 0) return;

    console.log('🖼️ [MEDIA] Flushing offline media queue:', queued.length);
    for (const item of queued) {
      try {
        const cacheKey = `${item.mediaId}-${item.variant}`;
        const lastSentAt = inFlightMedia.get(cacheKey) || 0;
        if (Date.now() - lastSentAt < MEDIA_RESEND_COOLDOWN_MS) {
          continue;
        }

        const blob = await getMediaBlob(item.mediaId, item.kind, item.variant);
        if (!blob) {
          // If blob is missing locally, drop queue item to avoid infinite retries
          console.warn('🖼️ [MEDIA] Missing local blob for queued media, dropping:', item.mediaId, item.variant);
          await removeFromOfflineMediaQueue(item.mediaId, item.variant);
          continue;
        }
        inFlightMedia.set(cacheKey, Date.now());
        await sendMediaInternal({ mediaId: item.mediaId, kind: item.kind, mime: item.mime, blob, variant: item.variant });
        // Removal happens on ACK for strongest guarantee; keep as backup
      } catch (e) {
        console.error('🖼️ [MEDIA] Failed to flush queued media:', item.mediaId, item.variant, e);
      }
    }
  } finally {
    mediaFlushInProgress = false;
  }
}

async function sendMediaInternal(args: { mediaId: string; kind: 'message' | 'memory'; mime: string; blob: Blob; variant?: MediaVariant }) {
  if (!globalMediaConn || !globalMediaConn.open) throw new Error('Media channel not connected');

  const buffer = await args.blob.arrayBuffer();
  const totalChunks = Math.ceil(buffer.byteLength / MEDIA_CHUNK_SIZE);
  const variant = args.variant ?? 'preview';

  // Init frame
  globalMediaConn.send({
    type: 'media-init',
    mediaId: args.mediaId,
    kind: args.kind,
    mime: args.mime,
    variant,
    byteLength: buffer.byteLength,
    chunkSize: MEDIA_CHUNK_SIZE,
    totalChunks,
    timestamp: Date.now(),
  });

  // Chunk frames (ordered, reliable)
  for (let i = 0; i < totalChunks; i++) {
    const start = i * MEDIA_CHUNK_SIZE;
    const end = Math.min(buffer.byteLength, start + MEDIA_CHUNK_SIZE);
    const chunk = buffer.slice(start, end);
    globalMediaConn.send({
      type: 'media-chunk',
      mediaId: args.mediaId,
      variant,
      index: i,
      data: chunk,
      timestamp: Date.now(),
    });
  }

  globalMediaConn.send({
    type: 'media-done',
    mediaId: args.mediaId,
    variant,
    timestamp: Date.now(),
  });
}

function setupMediaConnection(conn: DataConnection) {
  // Keep only one open media connection
  if (globalMediaConn && globalMediaConn.open && globalMediaConn.peer === conn.peer && globalMediaConn !== conn) {
    conn.close();
    return;
  }
  globalMediaConn = conn;

  conn.on('open', async () => {
    console.log('🖼️ [MEDIA] Binary channel established with:', conn.peer);
    // New connection: allow resend attempts for pending media
    inFlightMedia.clear();
    // Flush queued media on connect
    flushOfflineMediaQueue();
  });

  conn.on('data', async (data: any) => {
    // ACK from receiver → mark synced
    if (data?.type === 'media-ack' && data.mediaId) {
      const variant = (data.variant === 'full' ? 'full' : 'preview') as MediaVariant;
      console.log('✅ [MEDIA] Image synced:', data.mediaId, variant);
      try {
        await removeFromOfflineMediaQueue(data.mediaId, variant);
      } catch {}
      inFlightMedia.delete(`${data.mediaId}-${variant}`);
      return;
    }

    if (data?.type === 'media-init') {
      const variant = (data.variant === 'full' ? 'full' : 'preview') as MediaVariant;
      const entryKey = `${data.mediaId}-${variant}`;
      incomingMedia.set(entryKey, {
        kind: data.kind,
        mime: data.mime,
        variant,
        totalChunks: Number(data.totalChunks),
        received: 0,
        chunks: new Array(Number(data.totalChunks)),
      });
      return;
    }

    if (data?.type === 'media-chunk') {
      const variant = (data.variant === 'full' ? 'full' : 'preview') as MediaVariant;
      const entryKey = `${data.mediaId}-${variant}`;
      const entry = incomingMedia.get(entryKey);
      if (!entry) return;
      const idx = Number(data.index);
      if (Number.isFinite(idx) && idx >= 0 && idx < entry.totalChunks && !entry.chunks[idx]) {
        entry.chunks[idx] = data.data as ArrayBuffer;
        entry.received += 1;
      }
      return;
    }

    if (data?.type === 'media-done') {
      const variant = (data.variant === 'full' ? 'full' : 'preview') as MediaVariant;
      const entryKey = `${data.mediaId}-${variant}`;
      const entry = incomingMedia.get(entryKey);
      if (!entry) return;
      if (entry.received !== entry.totalChunks || entry.chunks.some((c) => !c)) {
        console.warn('🖼️ [MEDIA] media-done received but chunks incomplete:', data.mediaId, variant, entry.received, '/', entry.totalChunks);
        return;
      }

      try {
        const blob = new Blob(entry.chunks, { type: entry.mime });
        await saveMediaBlob(data.mediaId, blob, entry.kind, entry.variant);
        console.log('📥 [MEDIA] Image stored locally:', data.mediaId, entry.variant);
        window.dispatchEvent(new CustomEvent('dodi-media-ready', { detail: { mediaId: data.mediaId, kind: entry.kind, variant: entry.variant } }));

        // Send ACK to sender
        if (conn.open) {
          conn.send({ type: 'media-ack', mediaId: data.mediaId, variant: entry.variant, timestamp: Date.now() });
        }
      } catch (e) {
        console.error('🖼️ [MEDIA] Failed to store incoming media:', e);
      } finally {
        incomingMedia.delete(entryKey);
      }
      return;
    }
  });

  conn.on('close', () => {
    if (globalMediaConn === conn) globalMediaConn = null;
    inFlightMedia.clear();
  });

  conn.on('error', (err) => {
    console.error('🖼️ [MEDIA] Media connection error:', err);
    if (globalMediaConn === conn) globalMediaConn = null;
    inFlightMedia.clear();
  });
}

const WAKE_UP_PING_TIMEOUT_MS = 2000;

function safeClose(conn: DataConnection, label: string): void {
  try {
    conn.close();
    console.log('✅ Wake-up ping:', label);
  } catch (e) {
    // close() may throw if already closed or in bad state (e.g. some mobile browsers)
    console.warn('Wake-up ping close (ignored):', e);
  }
}

// Send a tiny wake-up signal via signaling server (Relay)
function sendWakeUpPing(partnerId: string) {
  if (!globalPeer || globalPeer.destroyed || globalPeer.disconnected) return;
  console.log('📡 Sending wake-up ping to partner via relay:', partnerId);

  const conn = globalPeer.connect(partnerId, {
    reliable: false,
    label: 'wake-up-ping',
    metadata: { type: 'wake-up', senderId: globalPeer.id }
  });

  let closed = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const closeOnce = (reason: string) => {
    if (closed) return;
    closed = true;
    if (timeoutId != null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    safeClose(conn, reason);
  };

  conn.on('open', () => {
    closeOnce('sent via relay');
  });

  conn.on('close', () => {
    closed = true;
    if (timeoutId != null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  });

  conn.on('error', () => {
    closeOnce('closed after error');
  });

  // Ensure relay connection closes even if open event doesn't fire (e.g. partner offline)
  timeoutId = setTimeout(() => {
    timeoutId = null;
    if (closed) return;
    closed = true;
    safeClose(conn, 'timed close');
  }, WAKE_UP_PING_TIMEOUT_MS);
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
  if (offlineQueue.length === 0) {
    queueIntendedForPartnerId = null;
  }
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
    if (reconnectStartedAt != null) {
      const latency = Date.now() - reconnectStartedAt;
      console.log(`⏱️ [RECONNECT] Tunnel re-established in ${latency}ms`);
      reconnectStartedAt = null;
    }
    console.log('✨ Persistent Direct P2P connection established with:', conn.peer);
    reconnectAttempt = 0;
    globalSyncCancelled = false; // Reset cancellation on new connection
    clearReconnectTimeout();
    clearAggressiveReconnect();
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
    
    // FLUSH OFFLINE QUEUE when connection established (only if queue was for this partner)
    if (offlineQueue.length > 0 && (queueIntendedForPartnerId === null || queueIntendedForPartnerId === conn.peer)) {
      flushOfflineQueue(conn);
    } else if (offlineQueue.length > 0 && queueIntendedForPartnerId != null && queueIntendedForPartnerId !== conn.peer) {
      console.warn('⚠️ [P2P] Offline queue built for different partner; clearing undeliverable messages');
      offlineQueue = [];
      queueIntendedForPartnerId = null;
      notifyQueueListeners(0);
      await clearOfflineQueue();
    }

    // Also flush any queued media blobs (via binary channel)
    flushOfflineMediaQueue();
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

    if (data.type === 'message-delete') {
      const { messageId } = data.data || {};
      if (messageId) {
        try {
          const { deleteMessage } = await import('@/lib/storage-encrypted');
          await deleteMessage(messageId);
          window.dispatchEvent(new CustomEvent('message-deleted', { detail: { messageId } }));
        } catch (e) {
          console.warn('Failed to delete message on message-delete:', e);
        }
      }
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
    clearHealthCheck();
    notifyListeners();
    startReconnecting();
  });
}

export interface RoomConnection {
  peer: Peer;
  conn: DataConnection;
  isCreator: boolean;
  peerId: string;
}

export async function initializePeer(id: string, retries: number = 3): Promise<Peer> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const peer = await new Promise<Peer>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('Connection to signaling server timed out'));
        }, 10000);
        
        const peer = new Peer(id, {
          host: '0.peerjs.com',
          port: 443,
          secure: true,
          debug: 1,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun.stunprotocol.org:3478' }
            ]
          }
        });
        
        peer.on('open', () => {
          clearTimeout(timeoutId);
          resolve(peer);
        });
        
        peer.on('error', (err) => {
          clearTimeout(timeoutId);
          peer.destroy();
          reject(err);
        });
      });
      
      return peer;
    } catch (err) {
      console.warn(`Peer init attempt ${attempt + 1}/${retries} failed:`, err);
      if (attempt === retries - 1) {
        throw new Error('Could not connect to pairing server. Please check your internet connection and try again.');
      }
      // Wait before retry with exponential backoff
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw new Error('Failed to initialize peer connection');
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

/** Call notify server to wake partner's device (push). Throttled; gated by allowWakeUp. */
async function tryNotifyPartner(): Promise<void> {
  if (!globalAllowWakeUp) return;
  const baseUrl = getNotifyServerUrl();
  if (!baseUrl) return;
  const partnerToken = await getPartnerPushToken();
  if (!partnerToken) return;
  if (Date.now() - lastNotifyAt < NOTIFY_THROTTLE_MS) return;
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: partnerToken }),
    });
    if (res.ok) lastNotifyAt = Date.now();
  } catch {
    // No log to avoid noise
  }
}

// Send a message or queue it if offline
export async function sendP2PMessage(message: SyncMessage) {
  if (globalConn && globalConn.open) {
    try {
      globalConn.send(message);
      console.log('📤 Message sent via P2P:', message.type);
      tryNotifyPartner().catch(() => {});
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
    queueIntendedForPartnerId = globalPartnerId; // Track who these messages are for
    await saveToOfflineQueue(msgId, message);
    notifyQueueListeners(offlineQueue.length);
    // Send wake-up ping as soon as there is a pending message (so partner's app can reconnect)
    if (globalPartnerId && globalAllowWakeUp && (!globalConn || !globalConn.open)) {
      sendWakeUpPing(globalPartnerId);
    }
    tryNotifyPartner().catch(() => {});
  }
  
  // Trigger reconnection if offline
  if (globalPartnerId && (!globalConn || !globalConn.open)) {
    connectToPartner(globalPartnerId);
  }
}

export function usePeerConnection(): UsePeerConnectionReturn {
  const { userId, partnerId, pairingStatus, allowWakeUp } = useDodi();
  const [state, setState] = useState<PeerConnectionState>(globalState);
  const [peerReinitTrigger, setPeerReinitTrigger] = useState(0);
  const pendingCount = useOfflineQueueSize();
  // Ref so event handlers always read current partnerId (avoids stale closure when peer is reused)
  const partnerIdRef = useRef(partnerId);
  partnerIdRef.current = partnerId;
  // Track which partnerId we last sent a wake-up ping for (to avoid duplicate pings per partner)
  const lastPendingPingPartnerRef = useRef<string | null>(null);

  // Expose allowWakeUp globally so sendP2PMessage can trigger wake-up as soon as message is queued
  useEffect(() => {
    globalAllowWakeUp = allowWakeUp;
    return () => {
      globalAllowWakeUp = false;
    };
  }, [allowWakeUp]);

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

  // Send wake-up ping when there are pending messages and we're disconnected (e.g. after load from persistence)
  useEffect(() => {
    if (state.connected) {
      lastPendingPingPartnerRef.current = null;
      return;
    }
    // Only ping if queue was built for this partner (or unknown from persistence); never ping new partner for old partner's messages
    const queueForCurrentPartner = queueIntendedForPartnerId === null || queueIntendedForPartnerId === partnerId;
    if (pendingCount > 0 && partnerId && allowWakeUp && queueForCurrentPartner && lastPendingPingPartnerRef.current !== partnerId) {
      lastPendingPingPartnerRef.current = partnerId;
      sendWakeUpPing(partnerId);
    }
  }, [pendingCount, state.connected, partnerId, allowWakeUp]);

  // 1. ESTABLISH PEER when userId, pairingStatus, or reinit trigger change
  useEffect(() => {
    const callback = () => setPeerReinitTrigger((t) => t + 1);
    onPeerDestroyedListeners.add(callback);
    return () => {
      onPeerDestroyedListeners.delete(callback);
    };
  }, []);

  useEffect(() => {
    if (pairingStatus !== 'connected' || !userId) {
      if (globalPeer) {
        console.log('🛑 [P2P] Destroying peer due to disconnection or logout');
        removePeerListeners(globalPeer);
        globalPeer.destroy();
        globalPeer = null;
        globalConn = null;
        globalMediaConn = null;
        reconnectStartedAt = null;
        clearReconnectTimeout();
        clearAggressiveReconnect();
        clearHealthCheck();
        notifyListeners();
      }
      return;
    }
    
    if (globalPeer && !globalPeer.destroyed && globalPeer.id === userId) {
      if (globalPeer.disconnected) globalPeer.reconnect();
      notifyListeners();
      return;
    }

    if (globalPeer) {
      removePeerListeners(globalPeer);
      globalPeer.destroy();
      clearReconnectTimeout();
      clearAggressiveReconnect();
      clearHealthCheck();
    }

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
        iceCandidatePoolSize: 10  // Pre-gather ICE candidates for faster connection
      }
    });

    globalPeer = peer;

    const handleOpen = (id: string) => {
      console.log('✅ My Peer ID is active:', id);
      notifyListeners();
      const target = globalPartnerId ?? partnerIdRef.current;
      if (target) connectToPartner(target);
    };

    const handleError = (err: unknown) => {
      console.error('PeerJS Error:', err);
      const e = err as { type?: string; message?: string };
      if (e.type === 'unavailable-id' || e.type === 'network' || e.type === 'server-error') {
        console.log('🔄 Peer error detected, rebuilding peer in 5s...');
        setTimeout(() => {
          if (!peer.destroyed) {
            peer.destroy();
            notifyListeners();
          }
        }, 5000);
      }
      globalState.error = e.type === 'unavailable-id' ? 'Connection conflict' : (e.message ?? '');
      notifyListeners();
    };

    const handleDisconnected = () => {
      console.log('📡 Disconnected from signaling server. Attempting reconnect...');
      notifyListeners();
      peer.reconnect();
      if (disconnectTimeoutId) clearTimeout(disconnectTimeoutId);
      disconnectTimeoutId = setTimeout(() => {
        if (peer.disconnected && !peer.destroyed) {
          console.log('🔄 Reconnect timed out, rebuilding peer...');
          removePeerListeners(peer);
          peer.destroy();
          if (globalPeer === peer) {
            globalPeer = null;
            globalConn = null;
            globalMediaConn = null;
          }
          reconnectAttempt = 0;
          reconnectStartedAt = null;
          clearReconnectTimeout();
          clearAggressiveReconnect();
          clearHealthCheck();
          notifyListeners();
          onPeerDestroyedListeners.forEach((cb) => cb());
        }
        disconnectTimeoutId = null;
      }, 10000);
    };

    const handleConnection = (conn: DataConnection) => {
      const label = (conn as DataConnection & { label?: string }).label;
      console.log('📞 Incoming connection from:', conn.peer, label ? `(label: ${label})` : '');
      const expectedPartner = globalPartnerId ?? partnerIdRef.current;

      if (conn.metadata?.type === 'wake-up') {
        if (conn.peer !== expectedPartner) {
          console.warn('🚫 Ignoring wake-up ping from unknown peer:', conn.peer);
          conn.close();
          return;
        }
        console.log('⚡ Received wake-up ping from partner. Reconnecting...');
        if (!globalConn || !globalConn.open) {
          console.log('🌱 Reconnected direct after ping');
          connectToPartner(conn.peer);
        } else {
          globalConn.send({ type: 'ping', timestamp: Date.now() });
        }
        conn.close();
        return;
      }

      if (conn.peer !== expectedPartner) {
        console.warn('🚫 Blocked unknown peer:', conn.peer);
        conn.close();
        return;
      }

      if (label === 'media') {
        if (globalMediaConn && globalMediaConn.open && globalMediaConn.peer === conn.peer) {
          console.log('♻️ Reusing existing media connection for:', conn.peer);
          conn.close();
          return;
        }
        setupMediaConnection(conn);
        return;
      }

      if (globalConn && globalConn.open && globalConn.peer === conn.peer) {
        console.log('♻️ Reusing existing open connection for:', conn.peer);
        conn.close();
        return;
      }
      setupConnection(conn);
    };

    currentPeerHandlers = { open: handleOpen, error: handleError, disconnected: handleDisconnected, connection: handleConnection };
    peer.on('open', handleOpen);
    peer.on('error', handleError);
    peer.on('disconnected', handleDisconnected);
    peer.on('connection', handleConnection);

    return () => {
      if (disconnectTimeoutId) {
        clearTimeout(disconnectTimeoutId);
        disconnectTimeoutId = null;
      }
      reconnectStartedAt = null;
      clearReconnectTimeout();
      clearAggressiveReconnect();
      // Intentionally DO NOT destroy peer on unmount to keep connection alive
    };
  }, [userId, pairingStatus, peerReinitTrigger]);

  // 2. CONNECT TO PARTNER whenever partnerId changes + Visibility triggers
  useEffect(() => {
    // Only update when truthy; preserve previous ID when partnerId is null (e.g. during reconnect)
    if (partnerId != null) globalPartnerId = partnerId;

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && partnerId) {
        visibilityGraceUntil = Date.now() + VISIBILITY_RECONNECT_GRACE_MS;
        notifyListeners();
        // Only reconnect if connection is actually down; delay to let connection state stabilize after tab becomes visible
        setTimeout(() => {
          if (!globalConn || !globalConn.open) {
            console.log('👀 [P2P] App visible - connection down, triggering reconnect');
            reconnectAttempt = 0;
            connectToPartner(partnerId);
          } else {
            console.log('👀 [P2P] App visible - connection still active, no reconnect needed');
          }
        }, 500);
      }
      // When tab becomes hidden, don't immediately disconnect - let grace period handle it
      // Connection stays alive for at least 5 minutes (handled by inactivity timer)
    };
    document.addEventListener('visibilitychange', handleVisibility);

    if (!partnerId || !globalPeer || globalPeer.destroyed) {
      return () => document.removeEventListener('visibilitychange', handleVisibility);
    }
    
    console.log('🔗 partnerId changed, connecting to:', partnerId);
    connectToPartner(partnerId);

    return () => document.removeEventListener('visibilitychange', handleVisibility);
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

  const sendMedia = useCallback(
    async ({ mediaId, kind, mime, variant = 'preview', blob: blobOverride }: { mediaId: string; kind: 'message' | 'memory'; mime: string; variant?: MediaVariant; blob?: Blob }) => {
      const blob = blobOverride ?? (await getMediaBlob(mediaId, kind, variant));
      if (!blob) {
        console.warn('🖼️ [MEDIA] No local blob found for mediaId:', mediaId, variant);
        return;
      }

      // Queue for retry when offline (both preview and full)
      const alreadyQueued = await isInOfflineMediaQueue(mediaId, variant);
      if (!alreadyQueued) {
        await saveToOfflineMediaQueue(mediaId, kind, mime, variant);
        console.log('🖼️ [MEDIA] Image queued:', mediaId, variant);
      }

      if (globalMediaConn && globalMediaConn.open) {
        try {
          const cacheKey = `${mediaId}-${variant}`;
          const lastSentAt = inFlightMedia.get(cacheKey) || 0;
          if (Date.now() - lastSentAt >= MEDIA_RESEND_COOLDOWN_MS) {
            inFlightMedia.set(cacheKey, Date.now());
            await sendMediaInternal({ mediaId, kind, mime, blob, variant });
            console.log('🖼️ [MEDIA] Image sent:', mediaId, variant);
          }
          return;
        } catch (e) {
          console.error('🖼️ [MEDIA] Failed to send media, will retry on reconnect:', e);
        }
      }

      // Trigger reconnection when offline so queued media (preview and full) can flush
      if (globalPartnerId && (!globalConn || !globalConn.open)) {
        connectToPartner(globalPartnerId);
      }
    },
    []
  );

  const reconnect = useCallback((force?: boolean) => {
    if (force) {
      // Full re-init like refresh: destroy peer so effect creates a new one
      console.log('🔄 [P2P] Force reconnect - full peer re-init');
      if (globalPeer) {
        removePeerListeners(globalPeer);
        globalPeer.destroy();
      }
      globalPeer = null;
      globalConn = null;
      globalMediaConn = null;
      reconnectAttempt = 0;
      reconnectStartedAt = null;
      aggressiveReconnectStartedAt = null;
      clearReconnectTimeout();
      clearAggressiveReconnect();
      clearHealthCheck();
      notifyListeners();
      onPeerDestroyedListeners.forEach((cb) => cb());
      return;
    }
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

  // Periodic health check - ensure connection is active; treat stale (no pong) as dead
  useEffect(() => {
    const checkInterval = allowWakeUp ? 5000 : 30 * 60 * 1000;
    const interval = setInterval(() => {
      notifyListeners();
      if (globalConn && globalConn.open && isConnectionLikelyDead()) {
        console.log('📡 [P2P] Periodic check: stale connection - triggering reconnect');
        globalConn.close();
        globalConn = null;
        clearHealthCheck();
        startReconnecting();
        return;
      }
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

  return { state, send, sendMedia, reconnect };
}
