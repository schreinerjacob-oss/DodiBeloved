import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useToast } from '@/hooks/use-toast';
import { useDodi } from '@/contexts/DodiContext';
import { hapticMedium } from '@/lib/haptics';

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

      hapticMedium();

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
    <div className="fixed inset-0 z-[250] pointer-events-none flex items-center justify-center" aria-live="polite">
      {/* Copper ripple — single expanding ring (water ripple); centering is in keyframes (translate(-50%, -50%)) */}
      <div className="absolute top-1/2 left-1/2 w-32 h-32 rounded-full border-2 border-copper/80 animate-copper-ripple" style={{ transformOrigin: 'center' }} />
      <div className="text-center px-8 py-6 rounded-2xl bg-white/90 dark:bg-card/90 shadow-xl relative z-10">
        <p className="text-3xl font-heading font-semibold text-foreground">You are loved</p>
      </div>
    </div>,
    document.body
  );
}
