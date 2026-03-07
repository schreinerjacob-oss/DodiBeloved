import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';

function useNativeKeepAwake(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
}

function isWakeLockSupported(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios') return true;
  return 'wakeLock' in navigator;
}

export interface UseWakeLockReturn {
  active: boolean;
  requestWakeLock: () => Promise<void>;
  releaseWakeLock: () => Promise<void>;
  isSupported: boolean;
}

/**
 * Screen Wake Lock: keeps the screen on. On iOS native uses @capacitor/keep-awake
 * (navigator.wakeLock not supported); on web/Android uses navigator.wakeLock.
 */
export function useWakeLock(enabled: boolean): UseWakeLockReturn {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);
  const [active, setActive] = useState(false);
  const supported = isWakeLockSupported();
  const useNative = useNativeKeepAwake();

  const releaseWakeLock = useCallback(async () => {
    if (useNative) {
      try {
        const { KeepAwake } = await import('@capacitor/keep-awake');
        await KeepAwake.allowSleep();
      } catch {}
      setActive(false);
      return;
    }
    if (!sentinelRef.current) return;
    try {
      await sentinelRef.current.release();
    } catch (e) {}
    sentinelRef.current = null;
    setActive(false);
  }, [useNative]);

  const requestWakeLock = useCallback(async () => {
    if (!supported || !enabled) return;
    if (useNative) {
      try {
        const { KeepAwake } = await import('@capacitor/keep-awake');
        await KeepAwake.keepAwake();
        setActive(true);
      } catch (e) {
        console.warn('KeepAwake failed:', e);
      }
      return;
    }
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
  }, [supported, enabled, useNative]);

  useEffect(() => {
    if (!enabled) {
      releaseWakeLock();
      return;
    }

    if (document.visibilityState === 'visible' || useNative) {
      requestWakeLock();
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && !useNative) {
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
  }, [enabled, requestWakeLock, releaseWakeLock, useNative]);

  return { active, requestWakeLock, releaseWakeLock, isSupported: supported };
}
