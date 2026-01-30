import { Route, Switch, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DodiProvider, useDodi } from "@/contexts/DodiContext";
import { OnboardingProvider, useOnboarding } from "@/contexts/OnboardingContext";
import { usePeerConnection } from "@/hooks/use-peer-connection";
import ProfileSetupPage from "@/pages/profile-setup";
import PairingPage from "@/pages/pairing";
import RedundancyPage from "@/pages/redundancy";
import ResetPage from "@/pages/reset";
import PinSetupPage from "@/pages/pin-setup";
import PinLockPage from "@/pages/pin-lock";
import OnboardingPage from "@/pages/onboarding";
import ChatPage from "@/pages/chat";
import MemoriesPage from "@/pages/memories";
import OurMomentsPage from "@/pages/our-moments";
import HeartSpacePage from "@/pages/heart-space";
import CallsPage from "@/pages/calls";
import SettingsPage from "@/pages/settings";
import SubscriptionPage from "@/pages/subscription";
import { MessageSquare, Camera, CalendarHeart, Phone, Settings, Lock, Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConnectionStatus } from "@/components/connection-status";
import { GlobalSyncHandler } from "@/components/global-sync-handler";
import { DodiRestoreListener } from "@/components/dodi-restore-listener";

function NavItem({ href, icon: Icon, label, active }: { href: string; icon: any; label: string; active: boolean }) {
  const [, setLocation] = useLocation();
  
  return (
    <button
      onClick={() => setLocation(href)}
      className={cn(
        "flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-all hover-elevate",
        active ? "text-primary" : "text-muted-foreground"
      )}
      data-testid={`nav-${label.toLowerCase().replace(' ', '-')}`}
    >
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
  
  const { state: peerState } = usePeerConnection();
  const partnerActive = peerState?.connected || false;

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
    { href: "/memories", icon: Camera, label: "Memories" },
    { href: "/moments", icon: CalendarHeart, label: "Moments" },
    { href: "/settings", icon: Settings, label: "Settings" },
  ];

  return (
    <div className="w-screen flex flex-col bg-background relative overflow-hidden h-screen" style={{ height: '100dvh' }}>
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

      <div className="flex-1 min-h-0 overflow-hidden relative z-10 flex flex-col">
        <div className="flex-1 min-h-0 overflow-auto flex flex-col">
          <Switch>
            <Route path="/pairing">{() => <PairingPage />}</Route>
            <Route path="/chat">{() => <ChatPage />}</Route>
            <Route path="/calls">{() => <CallsPage />}</Route>
            <Route path="/memories">{() => <MemoriesPage />}</Route>
            <Route path="/moments">{() => <OurMomentsPage />}</Route>
            <Route path="/heart-space">{() => <HeartSpacePage />}</Route>
            <Route path="/settings">{() => <SettingsPage />}</Route>
            <Route path="/subscription">{() => <SubscriptionPage />}</Route>
            <Route path="/setup">{() => <ProfileSetupPage />}</Route>
            <Route path="/redundancy">{() => <RedundancyPage />}</Route>
            <Route path="/reset">{() => <ResetPage />}</Route>
            <Route path="/">{() => <ChatPage />}</Route>
          </Switch>
        </div>
      </div>

      <nav className="border-t bg-card/80 backdrop-blur-sm px-2 py-2 flex-shrink-0 relative z-20" style={{ paddingBottom: 'var(--safe-area-inset-bottom)' }}>
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
          <Lock className="w-3 h-3" />
          <span>Encrypted</span>
          <div className="w-px h-3 bg-muted-foreground/30" />
          <ConnectionStatus />
        </div>
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <DodiProvider>
          <DodiRestoreListener />
          <OnboardingProvider>
            <MainApp />
            <Toaster />
          </OnboardingProvider>
        </DodiProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
