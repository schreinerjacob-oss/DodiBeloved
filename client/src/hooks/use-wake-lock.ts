import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';

function isWakeLockSupported(): boolean {
  if (typeof navigator === 'undefined') return false;
  return 'wakeLock' in navigator;
}

export interface UseWakeLockReturn {
  active: boolean;
  requestWakeLock: () => Promise<void>;
  releaseWakeLock: () => Promise<void>;
  isSupported: boolean;
}

/**
 * Screen Wake Lock: keeps the screen on using navigator.wakeLock API.
 * Supported on Android WebView (Chromium) and modern browsers.
 * Falls back gracefully on iOS where wakeLock is not available.
 */
export function useWakeLock(enabled: boolean): UseWakeLockReturn {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);
  const usingNativeRef = useRef(false);
  const [active, setActive] = useState(false);
  const supported = isWakeLockSupported();

  const allowNativeSleep = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return;
    try {
      const { KeepAwake } = await import('@capacitor-community/keep-awake');
      const { isSupported } = await KeepAwake.isSupported();
      if (!isSupported) return;
      await KeepAwake.allowSleep();
    } catch {}
  }, []);

  const keepNativeAwake = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return;
    try {
      const { KeepAwake } = await import('@capacitor-community/keep-awake');
      const { isSupported } = await KeepAwake.isSupported();
      if (!isSupported) return;
      await KeepAwake.keepAwake();
    } catch {}
  }, []);

  const releaseWakeLock = useCallback(async () => {
    if (usingNativeRef.current) {
      usingNativeRef.current = false;
      await allowNativeSleep();
      setActive(false);
      return;
    }

    if (!sentinelRef.current) return;
    try {
      await sentinelRef.current.release();
    } catch (e) {}
    sentinelRef.current = null;
    setActive(false);
  }, [allowNativeSleep]);

  const requestWakeLock = useCallback(async () => {
    if (!enabled) return;

    // Web / Android Chromium etc.
    if (supported) {
      if (sentinelRef.current) return;
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
      return;
    }

    // iOS (native WebView) fallback: native keep-awake plugin.
    if (Capacitor.isNativePlatform()) {
      if (usingNativeRef.current) return;
      await keepNativeAwake();
      usingNativeRef.current = true;
      setActive(true);
    }
  }, [supported, enabled, keepNativeAwake]);

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
