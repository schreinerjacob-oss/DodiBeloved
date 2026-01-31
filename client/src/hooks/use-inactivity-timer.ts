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

  const resetTimer = useCallback(() => {
    if (!enabled) return;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    lastActivityRef.current = Date.now();

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

    // Lock immediately when tab is hidden (privacy: device left with app in background).
    // When tab becomes visible again, reset the inactivity timer after user returns.
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        onInactivity();
      } else if (document.visibilityState === 'visible') {
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
    };
  }, [resetTimer, enabled]);

  return { resetTimer };
}
