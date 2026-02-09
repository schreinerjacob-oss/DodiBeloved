import { useEffect, useCallback, useRef } from 'react';

interface UseInactivityTimerProps {
  onInactivity: () => void;
  timeoutMinutes?: number;
  enabled?: boolean;
}

export function useInactivityTimer({
  onInactivity,
  timeoutMinutes = 10,
  enabled = true,
}: UseInactivityTimerProps) {
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const hiddenSinceRef = useRef<number | null>(null);
  const gracePeriodTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const GRACE_PERIOD_MS = 5 * 60 * 1000; // 5 minutes grace period after screen lock

  const resetTimer = useCallback(() => {
    if (!enabled) return;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    if (gracePeriodTimeoutRef.current) {
      clearTimeout(gracePeriodTimeoutRef.current);
      gracePeriodTimeoutRef.current = null;
    }

    lastActivityRef.current = Date.now();
    hiddenSinceRef.current = null;

    timerRef.current = setTimeout(() => {
      console.log(`Inactivity timeout (${timeoutMinutes} minutes) reached`);
      onInactivity();
    }, timeoutMinutes * 60 * 1000);
  }, [onInactivity, timeoutMinutes, enabled]);

  useEffect(() => {
    if (!enabled) return;

    resetTimer();

    const handleActivity = () => {
      resetTimer();
    };

    // Track user activity
    const events = [
      'mousedown',
      'keydown',
      'scroll',
      'touchstart',
      'click',
      'mousemove',
    ];

    events.forEach((event) => {
      document.addEventListener(event, handleActivity);
    });

    // When tab becomes hidden, start a grace period before locking.
    // This keeps the connection alive for 5 minutes after screen lock.
    // When tab becomes visible again, cancel any pending lock and reset the timer.
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenSinceRef.current = Date.now();
        // Clear the normal inactivity timer
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        // Start grace period timer - lock after 5 minutes of being hidden
        if (gracePeriodTimeoutRef.current) {
          clearTimeout(gracePeriodTimeoutRef.current);
        }
        gracePeriodTimeoutRef.current = setTimeout(() => {
          console.log('Grace period (5 minutes) expired after tab hidden - locking app');
          onInactivity();
          gracePeriodTimeoutRef.current = null;
        }, GRACE_PERIOD_MS);
      } else if (document.visibilityState === 'visible') {
        // Cancel grace period lock if still pending
        if (gracePeriodTimeoutRef.current) {
          clearTimeout(gracePeriodTimeoutRef.current);
          gracePeriodTimeoutRef.current = null;
        }
        hiddenSinceRef.current = null;
        // Reset normal inactivity timer
        resetTimer();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      events.forEach((event) => {
        document.removeEventListener(event, handleActivity);
      });
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      if (gracePeriodTimeoutRef.current) {
        clearTimeout(gracePeriodTimeoutRef.current);
      }
    };
  }, [resetTimer, enabled]);

  return { resetTimer };
}
