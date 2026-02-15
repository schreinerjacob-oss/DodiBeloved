import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useToast } from '@/hooks/use-toast';
import { useDodi } from '@/contexts/DodiContext';

/**
 * Global listener for 'thinking-of-you' P2P messages.
 * When partner sends a heart: vibrate device, flash gold on screen, show "You are loved" popup.
 */
export function DodiThinkingOfYouHandler() {
  const { pairingStatus } = useDodi();
  const { toast } = useToast();
  const [showFlash, setShowFlash] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const msg = (e as CustomEvent).detail;
      if (!msg || msg.type !== 'thinking-of-you') return;
      if (pairingStatus !== 'connected') return;

      // Vibrate device
      if ('vibrate' in navigator) {
        navigator.vibrate([200, 100, 200]);
      }

      // Flash gold overlay
      setShowFlash(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setShowFlash(false), 1200);
    };

    window.addEventListener('p2p-message', handler);
    return () => {
      window.removeEventListener('p2p-message', handler);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [pairingStatus]);

  useEffect(() => {
    if (!showFlash) return;
    toast({
      title: 'You are loved',
      description: 'Your beloved is thinking of you',
      duration: 3000,
    });
  }, [showFlash, toast]);

  if (!showFlash) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[250] pointer-events-none flex items-center justify-center bg-gold/50 animate-in fade-in duration-200"
      aria-live="polite"
    >
      <div className="text-center px-8 py-6 rounded-2xl bg-white/80 dark:bg-card/90 shadow-xl">
        <p className="text-3xl font-serif text-foreground">You are loved</p>
      </div>
    </div>,
    document.body
  );
}
