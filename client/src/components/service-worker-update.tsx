import { useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";

/**
 * Registers the service worker, checks for updates on load, and prompts the user
 * to reload when a new version has taken over (so they get fresh JS after a deploy).
 */
export function ServiceWorkerUpdateNotifier() {
  const { toast } = useToast();
  const didPromptRef = useRef(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

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

    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        reg.update();
        if (navigator.serviceWorker.controller) {
          navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
        }
      })
      .catch(() => {});

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, [toast]);

  return null;
}
