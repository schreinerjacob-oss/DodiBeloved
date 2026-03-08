import { useState, useEffect } from 'react';

/**
 * Proximity sensor for "phone to face" during calls.
 * Uses the deprecated UserProximityEvent when available (e.g. some mobile browsers).
 * When not supported, returns supported: false; the caller can offer a manual "Dim screen" toggle.
 */
export function useProximity(enabled: boolean) {
  const [isNear, setIsNear] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setIsNear(false);
      return;
    }

    const handler = (e: Event) => {
      const ev = e as unknown as { near?: boolean };
      setIsNear(!!ev.near);
    };

    // UserProximityEvent is deprecated and not supported in most modern browsers.
    // We try it; if it never fires or isn't available, supported stays false.
    const win = typeof window !== 'undefined' ? window : null;
    if (!win || !('onuserproximity' in win)) {
      setSupported(false);
      return;
    }

    win.addEventListener('userproximity', handler);
    setSupported(true);

    return () => {
      win.removeEventListener('userproximity', handler);
      setIsNear(false);
    };
  }, [enabled]);

  return { isNear, supported };
}
