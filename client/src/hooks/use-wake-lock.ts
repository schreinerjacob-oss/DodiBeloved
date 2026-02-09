import { useCallback, useEffect, useRef, useState } from 'react';

function isWakeLockSupported(): boolean {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
}

export interface UseWakeLockReturn {
  active: boolean;
  requestWakeLock: () => Promise<void>;
  releaseWakeLock: () => Promise<void>;
  isSupported: boolean;
}

/**
 * Screen Wake Lock: keeps the screen on and reduces tab throttling while the app
 * is in the foreground and enabled. Release when tab is hidden or when app locks.
 */
export function useWakeLock(enabled: boolean): UseWakeLockReturn {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);
  const [active, setActive] = useState(false);
  const supported = isWakeLockSupported();

  const releaseWakeLock = useCallback(async () => {
    if (!sentinelRef.current) return;
    try {
      await sentinelRef.current.release();
    } catch (e) {
      // Ignore if already released
    }
    sentinelRef.current = null;
    setActive(false);
  }, []);

  const requestWakeLock = useCallback(async () => {
    if (!supported || !enabled) return;
    if (sentinelRef.current) return; // Already holding
    if (document.visibilityState !== 'visible') return;

    try {
      const sentinel = await navigator.wakeLock.request('screen');
      sentinelRef.current = sentinel;
      setActive(true);

      sentinel.addEventListener('release', () => {
        sentinelRef.current = null;
        setActive(false);
      });
    } catch (e) {
      console.warn('Wake Lock request failed:', e);
    }
  }, [supported, enabled]);

  useEffect(() => {
    if (!enabled) {
      releaseWakeLock();
      return;
    }

    if (document.visibilityState === 'visible') {
      requestWakeLock();
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        releaseWakeLock();
      } else if (document.visibilityState === 'visible' && enabled) {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      releaseWakeLock();
    };
  }, [enabled, requestWakeLock, releaseWakeLock]);

  return { active, requestWakeLock, releaseWakeLock, isSupported: supported };
}
