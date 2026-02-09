const RECONNECT_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const PERIODIC_SYNC_TAG = 'dodi-reconnect';

let backgroundIntervalId: number | null = null;
let reconnectCallback: (() => void) | null = null;
let visibilityPollingSetup = false;
let swMessageListenerSetup = false;

export function setReconnectCallback(callback: () => void): void {
  reconnectCallback = callback;
}

export function isPeriodicSyncSupported(): boolean {
  return 'serviceWorker' in navigator && 'periodicSync' in (navigator as any);
}

export async function registerPeriodicSync(): Promise<boolean> {
  if (!isPeriodicSyncSupported()) {
    console.log('⏰ Periodic Sync not supported, using fallback');
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const periodicSync = (registration as any).periodicSync;
    
    const status = await navigator.permissions.query({
      name: 'periodic-background-sync' as PermissionName,
    });

    if (status.state !== 'granted') {
      console.log('⏰ Periodic Sync permission not granted');
      return false;
    }

    await periodicSync.register(PERIODIC_SYNC_TAG, {
      minInterval: RECONNECT_INTERVAL_MS,
    });
    
    console.log('✅ Periodic Sync registered');
    return true;
  } catch (error) {
    console.warn('⏰ Failed to register Periodic Sync:', error);
    return false;
  }
}

export function startBackgroundPolling(): void {
  if (backgroundIntervalId !== null) {
    return;
  }

  console.log('⏰ Starting background polling (30 min interval)');
  
  backgroundIntervalId = window.setInterval(() => {
    console.log('⏰ Background poll: attempting P2P reconnect');
    if (reconnectCallback) {
      reconnectCallback();
    }
  }, RECONNECT_INTERVAL_MS);
}

export function stopBackgroundPolling(): void {
  if (backgroundIntervalId !== null) {
    console.log('⏰ Stopping background polling');
    window.clearInterval(backgroundIntervalId);
    backgroundIntervalId = null;
  }
}

export function setupVisibilityBasedPolling(): void {
  if (visibilityPollingSetup) return;
  visibilityPollingSetup = true;

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // Start background polling when tab is hidden, but don't immediately disconnect
      // Connection stays alive for grace period (handled by inactivity timer)
      startBackgroundPolling();
    } else {
      stopBackgroundPolling();
      // Only trigger reconnect if callback exists and connection is actually down
      // The reconnect callback should check connection status before reconnecting
      if (reconnectCallback) {
        console.log('👁️ App visible - checking connection status');
        // Small delay to allow connection state to stabilize after tab becomes visible
        setTimeout(() => {
          reconnectCallback();
        }, 500);
      }
    }
  });

  console.log('✅ Visibility-based background polling initialized');
}

function setupServiceWorkerMessageListener(): void {
  if (!('serviceWorker' in navigator)) return;
  if (swMessageListenerSetup) return;
  swMessageListenerSetup = true;

  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'background-reconnect') {
      console.log('⏰ Received background-reconnect from SW');
      if (reconnectCallback) {
        reconnectCallback();
      }
    }
  });

  console.log('✅ Service Worker message listener initialized');
}

export async function initializeBackgroundSync(onReconnect: () => void): Promise<void> {
  setReconnectCallback(onReconnect);
  
  // Listen for SW messages (for periodic sync)
  setupServiceWorkerMessageListener();
  
  const periodicSyncRegistered = await registerPeriodicSync();
  
  if (!periodicSyncRegistered) {
    setupVisibilityBasedPolling();
  }
}
