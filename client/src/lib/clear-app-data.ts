const DB_NAME = 'dodi-encrypted-storage';

export async function clearAllAppData(): Promise<void> {
  console.log('🧹 [CLEAR] Starting complete app data wipe...');
  
  try {
    localStorage.clear();
    console.log('✅ [CLEAR] localStorage cleared');
  } catch (e) {
    console.warn('Failed to clear localStorage:', e);
  }
  
  try {
    const dbs = await indexedDB.databases?.();
    if (dbs) {
      for (const db of dbs) {
        if (db.name) {
          await deleteDatabase(db.name);
          console.log(`✅ [CLEAR] Deleted IndexedDB: ${db.name}`);
        }
      }
    } else {
      await deleteDatabase(DB_NAME);
      console.log('✅ [CLEAR] Deleted main IndexedDB');
    }
  } catch (e) {
    console.warn('Failed to clear IndexedDB:', e);
    try {
      await deleteDatabase(DB_NAME);
    } catch (e2) {
      console.warn('Fallback IndexedDB deletion failed:', e2);
    }
  }
  
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        await registration.unregister();
        console.log('✅ [CLEAR] Unregistered service worker');
      }
    }
  } catch (e) {
    console.warn('Failed to unregister service workers:', e);
  }
  
  try {
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      for (const cacheName of cacheNames) {
        await caches.delete(cacheName);
        console.log(`✅ [CLEAR] Deleted cache: ${cacheName}`);
      }
    }
  } catch (e) {
    console.warn('Failed to clear caches:', e);
  }
  
  try {
    sessionStorage.clear();
    console.log('✅ [CLEAR] sessionStorage cleared');
  } catch (e) {
    console.warn('Failed to clear sessionStorage:', e);
  }
  
  console.log('🧹 [CLEAR] App data wipe complete');
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      console.warn(`Database ${name} is blocked. Waiting...`);
      setTimeout(() => resolve(), 500);
    };
  });
}

export async function clearAndReload(): Promise<void> {
  await clearAllAppData();
  window.location.href = '/';
}

export async function clearAndGoToPairing(): Promise<void> {
  await clearAllAppData();
  window.location.href = '/pairing';
}

/**
 * Clear only caches and service workers, then reload. Keeps IndexedDB and localStorage
 * so pairing and data stay. Use when the app is broken after an update and you want
 * to force-fetch the latest JS without unpairing.
 */
export async function clearCachesAndReload(): Promise<void> {
  console.log('🔄 [CLEAR] Clearing caches and service workers (keeping data)...');
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        await registration.unregister();
        console.log('✅ [CLEAR] Unregistered service worker');
      }
    }
  } catch (e) {
    console.warn('Failed to unregister service workers:', e);
  }
  try {
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      for (const cacheName of cacheNames) {
        await caches.delete(cacheName);
        console.log(`✅ [CLEAR] Deleted cache: ${cacheName}`);
      }
    }
  } catch (e) {
    console.warn('Failed to clear caches:', e);
  }
  // Reload with cache-busting query so the document and assets are re-fetched (avoids stale JS chunks)
  const url = new URL(window.location.href);
  url.searchParams.set('_b', String(Date.now()));
  window.location.replace(url.toString());
}
