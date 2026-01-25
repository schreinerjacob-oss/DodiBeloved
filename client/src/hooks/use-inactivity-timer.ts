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

    // Handle page visibility changes (when user switches back to app)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const now = Date.now();
        const inactiveTime = now - lastActivityRef.current;
        if (inactiveTime > timeoutMinutes * 60 * 1000) {
          console.log('Visibility check: Inactivity timeout reached');
          onInactivity();
        } else {
          resetTimer();
        }
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
