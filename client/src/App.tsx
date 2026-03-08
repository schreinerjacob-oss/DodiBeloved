import { useEffect, useLayoutEffect, useRef, lazy, Suspense } from "react";
import { Route, Switch, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DodiProvider, useDodi } from "@/contexts/DodiContext";
import { OnboardingProvider, useOnboarding } from "@/contexts/OnboardingContext";
import { usePeerConnection } from "@/hooks/use-peer-connection";
import { useWakeLock } from "@/hooks/use-wake-lock";
import ProfileSetupPage from "@/pages/profile-setup";
import PairingPage from "@/pages/pairing";
import RedundancyPage from "@/pages/redundancy";
import ResetPage from "@/pages/reset";
import PinSetupPage from "@/pages/pin-setup";
import PinLockPage from "@/pages/pin-lock";
import OnboardingPage from "@/pages/onboarding";
import { MessageSquare, Camera, Phone, Settings, Lock, Heart } from "lucide-react";
import dodiTypographyLogo from '@assets/generated_images/hebrew_dodi_typography_logo.png';
import { cn } from "@/lib/utils";
import { ConnectionStatus } from "@/components/connection-status";
import { IncomingCallOverlay } from "@/components/incoming-call-overlay";
import { GlobalSyncHandler } from "@/components/global-sync-handler";
import { DodiRestoreListener } from "@/components/dodi-restore-listener";
import { DodiThinkingOfYouHandler } from "@/components/dodi-thinking-of-you-handler";
import { PwaInstallBanner } from "@/components/pwa-install-banner";
import { ServiceWorkerUpdateNotifier } from "@/components/service-worker-update";
import { getNotifyServerUrl, registerPushWithNotifyServer } from "@/lib/push-register";
import { getNotificationPermission } from "@/lib/notifications";
import { Capacitor } from "@capacitor/core";

const ChatPage = lazy(() => import("@/pages/chat"));
const MemoriesPage = lazy(() => import("@/pages/memories"));
const HeartSpacePage = lazy(() => import("@/pages/heart-space"));
const CallsPage = lazy(() => import("@/pages/calls"));
const SettingsPage = lazy(() => import("@/pages/settings"));

function NavItem({ href, icon: Icon, label, active }: { href: string; icon: any; label: string; active: boolean }) {
  const [, setLocation] = useLocation();

  return (
    <button
      onClick={() => setLocation(href)}
      className={cn(
        "flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-all hover-elevate relative",
        active ? "text-foreground" : "text-muted-foreground"
      )}
      data-testid={`nav-${label.toLowerCase().replace(' ', '-')}`}
    >
      {active && (
        <span className="absolute top-0 left-2 right-2 h-0.5 rounded-full bg-gold/70 animate-gold-grow" />
      )}
      <Icon className={cn("w-5 h-5", active && "animate-gentle-bounce")} />
      <span className="text-xs font-medium">{label}</span>
    </button>
  );
}

function MainApp() {
  const dodi = useDodi();
  const onboarding = useOnboarding();
  
  const userId = dodi.userId;
  const pairingStatus = dodi.pairingStatus;
  const isLocked = dodi.isLocked;
  const showPinSetup = dodi.showPinSetup;
  const isLoading = dodi.isLoading;
  const hasSeenTutorial = onboarding.hasSeenTutorial;
  
  const [location] = useLocation();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevLocationRef = useRef<string>(location);
  const justLeftChatRef = useRef(false);

  const { state: peerState } = usePeerConnection();

  // Screen Wake Lock: keep device from dimming/sleeping while app is in foreground and unlocked
  useWakeLock(!isLocked && pairingStatus === 'connected');

  // Native: status bar and splash — set style once, hide splash when app ready (loading done)
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const run = async () => {
      const [{ StatusBar }, { SplashScreen }] = await Promise.all([
        import('@capacitor/status-bar'),
        import('@capacitor/splash-screen'),
      ]);
      try {
        await StatusBar.setStyle({ style: 'DARK' });
      } catch {}
      if (!isLoading) {
        await SplashScreen.hide();
      }
    };
    run();
  }, [isLoading]);

  // Register push subscription with notify server when paired and permission granted (and on load when already paired)
  useEffect(() => {
    if (pairingStatus !== 'connected' || !getNotifyServerUrl()) return;
    getNotificationPermission().then((p) => {
      if (p === 'granted') void registerPushWithNotifyServer();
    });
  }, [pairingStatus]);

  // Reset scroll position on route change and force layout so new page content (and nested ScrollArea) get correct height and don’t render blank
  // Reset scroll position on route change so new page is shown from top

  // Force layout recalculation after route content mounts so nested ScrollArea gets correct viewport height.
  // When leaving Chat, run extra passes – Chat uses plain overflow-y-auto; other pages use ScrollArea
  // and can collapse if layout hasn't settled when Chat's structure unmounts.
  useLayoutEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const wasOnChat = prevLocationRef.current === '/chat' || prevLocationRef.current === '/';
    prevLocationRef.current = location;
    const forceLayout = () => {
      void el.offsetHeight;
      window.dispatchEvent(new Event('resize'));
    };
    let raf2: number | undefined;
    let t1: ReturnType<typeof setTimeout> | undefined;
    let t2: ReturnType<typeof setTimeout> | undefined;
    let t3: ReturnType<typeof setTimeout> | undefined;
    if (wasOnChat && location !== '/chat' && location !== '/') {
      justLeftChatRef.current = true;
    }
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        forceLayout();
        if (wasOnChat && location !== '/chat' && location !== '/') {
          t1 = setTimeout(forceLayout, 50);
          t2 = setTimeout(forceLayout, 150);
          t3 = setTimeout(forceLayout, 300);
        }
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2 != null) cancelAnimationFrame(raf2);
      if (t1 != null) clearTimeout(t1);
      if (t2 != null) clearTimeout(t2);
      if (t3 != null) clearTimeout(t3);
    };
  }, [location]);

  // After paint: when we've just left Chat, force one more layout so ScrollArea on the new page definitely gets correct dimensions
  useEffect(() => {
    if (!justLeftChatRef.current) return;
    justLeftChatRef.current = false;
    const el = scrollContainerRef.current;
    if (!el) return;
    const id = setTimeout(() => {
      void el.offsetHeight;
      window.dispatchEvent(new Event('resize'));
    }, 100);
    return () => clearTimeout(id);
  }, [location]);

  const partnerActive = peerState?.connected || false;
  const isDemoMode = dodi.isDemoMode ?? false;

  // Allow reset route before any authentication checks
  if (location === '/reset') {
    return <ResetPage />;
  }

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-sage font-medium tracking-widest uppercase text-xs">Entering Sanctuary...</div>
      </div>
    );
  }

  // Force signup page if no profile exists
  if (!userId) {
    return <ProfileSetupPage />;
  }

  if (pairingStatus !== 'connected') {
    return <PairingPage />;
  }

  if (showPinSetup) {
    return <PinSetupPage onComplete={() => {}} />;
  }

  if (!hasSeenTutorial) {
    return <OnboardingPage />;
  }

  if (isLocked) {
    return <PinLockPage />;
  }

  const navItems = [
    { href: "/chat", icon: MessageSquare, label: "Chat" },
    { href: "/calls", icon: Phone, label: "Calls" },
    { href: "/heart-space", icon: Heart, label: "Heart" },
    { href: "/memories", icon: Camera, label: "Our Story" },
    { href: "/settings", icon: Settings, label: "Settings" },
  ];

  const otherContentPaths = ["/calls", "/memories", "/heart-space", "/settings", "/redundancy", "/setup", "/pairing"];
  const showChat = !otherContentPaths.includes(location);

  return (
    <div className="w-screen flex flex-col bg-background relative overflow-hidden h-screen" style={{ height: '100dvh' }}>
      {isDemoMode && (
        <div className="absolute top-0 left-0 right-0 z-30 bg-amber-500/90 text-amber-950 text-center py-1.5 text-xs font-medium">
          Demo mode — for app review. No real pairing or data.
        </div>
      )}
      <GlobalSyncHandler />
      
      {/* Presence Glow & Vine Animation */}
      {partnerActive && (
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden select-none">
          {/* Main Background Glows */}
          <div className="absolute -top-32 -left-32 w-96 h-96 bg-primary/15 rounded-full blur-[120px] animate-pulse" />
          <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-accent/15 rounded-full blur-[120px] animate-pulse delay-700" />
          
          {/* Vine-like presence orbs */}
          <div className="absolute top-1/4 -left-8 w-32 h-64 bg-sage/20 rounded-full blur-[60px] animate-gentle-bounce rotate-12 opacity-40" />
          <div className="absolute bottom-1/4 -right-8 w-32 h-64 bg-sage/20 rounded-full blur-[60px] animate-gentle-bounce delay-1000 -rotate-12 opacity-40" />
          
          {/* Subtle sparkles */}
          <div className="absolute top-20 right-20 w-1 h-1 bg-gold rounded-full blur-[1px] animate-pulse" />
          <div className="absolute bottom-40 left-10 w-1.5 h-1.5 bg-gold/50 rounded-full blur-[2px] animate-pulse delay-500" />
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-hidden flex flex-col z-10" style={{ minHeight: 0 }}>
          {/* Content area: each page fills viewport and manages its own scroll. Keep all main-tab pages mounted and toggle visibility so layout never collapses when leaving Chat. Unknown routes fall back to Chat (same as previous Route path="/"). */}
          <div ref={scrollContainerRef} className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden">
            <Suspense fallback={<div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Loading...</div>}>
            <div className={cn("flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden", !showChat && "hidden")}>
              <ChatPage />
            </div>
            <div className={cn("flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden", location !== "/calls" && "hidden")}>
              <CallsPage />
            </div>
            <div className={cn("flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden", location !== "/memories" && "hidden")}>
              <MemoriesPage />
            </div>
            <div className={cn("flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden", location !== "/heart-space" && "hidden")}>
              <HeartSpacePage />
            </div>
            <div className={cn("flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden", location !== "/settings" && "hidden")}>
              <SettingsPage />
            </div>
            </Suspense>
            {/* Secondary routes (from settings etc.): render when location matches so content is never blank. /pairing included so route-based navigation matches state-based rendering. */}
            <div className={cn("flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden", location !== "/redundancy" && location !== "/setup" && location !== "/pairing" && "hidden")}>
              <Switch>
                <Route path="/redundancy">{() => <RedundancyPage />}</Route>
                <Route path="/setup">{() => <ProfileSetupPage />}</Route>
                <Route path="/pairing">{() => <PairingPage />}</Route>
              </Switch>
            </div>
          </div>
      </div>

      <nav className="border-t border-gold/20 bg-card/90 backdrop-blur-sm px-2 py-2 flex-shrink-0 relative z-20 wood-grain" style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))' }}>
        <div className="flex items-center justify-around max-w-md mx-auto">
          {navItems.map((item) => (
            <NavItem
              key={item.href}
              {...item}
              active={location === item.href || (location === "/" && item.href === "/chat")}
            />
          ))}
        </div>
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground mt-1">
          <Lock className="w-3 h-3 text-gold/70" />
          <span>Encrypted</span>
          <div className="w-px h-3 bg-muted-foreground/30" />
          <img src={dodiTypographyLogo} alt="dodi" className="h-4 opacity-40 dark:opacity-30" />
          <div className="w-px h-3 bg-muted-foreground/30" />
          <ConnectionStatus />
        </div>
      </nav>

      <PwaInstallBanner />
      <IncomingCallOverlay />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <DodiProvider>
          <DodiRestoreListener />
          <DodiThinkingOfYouHandler />
          <ServiceWorkerUpdateNotifier />
          <OnboardingProvider>
            <MainApp />
            <Toaster />
          </OnboardingProvider>
        </DodiProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
