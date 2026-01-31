import { useState, useEffect, useCallback } from 'react';

const DISMISSED_KEY = 'dodi-pwa-install-dismissed';
const DISMISSED_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface PwaInstallState {
  canInstall: boolean;
  isInstalled: boolean;
  prompt: () => Promise<void>;
  dismiss: () => void;
  wasDismissed: boolean;
}

export function usePwaInstall(): PwaInstallState {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [wasDismissed, setWasDismissed] = useState(false);

  useEffect(() => {
    const checkStandalone = () => {
      const standalone = (window as any).matchMedia?.('(display-mode: standalone)')?.matches
        || (navigator as any).standalone === true
        || document.referrer.includes('android-app://');
      setIsInstalled(standalone);
    };
    checkStandalone();
  }, []);

  useEffect(() => {
    const dismissedAt = localStorage.getItem(DISMISSED_KEY);
    if (dismissedAt) {
      const elapsed = Date.now() - Number(dismissedAt);
      setWasDismissed(elapsed < DISMISSED_TTL_MS);
    }
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const prompt = useCallback(async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
        setIsInstalled(true);
      }
    } catch (e) {
      console.warn('PWA install prompt failed:', e);
    }
  }, [deferredPrompt]);

  const dismiss = useCallback(() => {
    setWasDismissed(true);
    localStorage.setItem(DISMISSED_KEY, String(Date.now()));
  }, []);

  const canInstall = Boolean(deferredPrompt && !isInstalled && !wasDismissed);

  return {
    canInstall,
    isInstalled,
    prompt,
    dismiss,
    wasDismissed,
  };
}
