import { useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Registers the service worker, checks for updates on load and when returning
 * to the tab, and prompts the user to reload when a new version has taken over.
 */
export function ServiceWorkerUpdateNotifier() {
  const { toast } = useToast();
  const didPromptRef = useRef(false);
  const regRef = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | undefined;

    const onControllerChange = () => {
      if (didPromptRef.current) return;
      didPromptRef.current = true;
      toast({
        title: "New version available",
        description: "Reload to get the latest Dodi.",
        action: (
          <ToastAction altText="Reload" onClick={() => window.location.reload()}>
            Reload
          </ToastAction>
        ),
      });
    };

    const checkForUpdates = () => regRef.current?.update();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") checkForUpdates();
    };

    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        if (cancelled) return;
        regRef.current = reg;
        reg.update();
        navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
        document.addEventListener("visibilitychange", onVisibilityChange);
        interval = setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL_MS);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      regRef.current = null;
      if (interval) clearInterval(interval);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [toast]);

  return null;
}
