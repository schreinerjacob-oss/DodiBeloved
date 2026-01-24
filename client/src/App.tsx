import { useEffect } from "react";
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
import PinSetupPage from "@/pages/pin-setup";
import PinLockPage from "@/pages/pin-lock";
import OnboardingPage from "@/pages/onboarding";
import ChatPage from "@/pages/chat";
import MemoriesPage from "@/pages/memories";
import OurMomentsPage from "@/pages/our-moments";
import DailyWhisperPage from "@/pages/daily-whisper";
import LoveNotesPage from "@/pages/love-notes";
import PrayersPage from "@/pages/prayers";
import SettingsPage from "@/pages/settings";
import { MessageSquare, Camera, CalendarHeart, Settings, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConnectionStatus } from "@/components/connection-status";
import { GlobalSyncHandler } from "@/components/global-sync-handler";

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
  const hasSeenTutorial = onboarding.hasSeenTutorial ?? true;
  
  const [location] = useLocation();
  
  usePeerConnection();

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-sage font-medium">Entering Sanctuary...</div>
      </div>
    );
  }

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
    { href: "/memories", icon: Camera, label: "Memories" },
    { href: "/moments", icon: CalendarHeart, label: "Moments" },
    { href: "/settings", icon: Settings, label: "Settings" },
  ];

  return (
    <div className="w-screen flex flex-col bg-background" style={{ minHeight: '100dvh' }}>
      <GlobalSyncHandler />
      <div className="flex-1 overflow-hidden">
        <Switch>
          <Route path="/chat" component={ChatPage} />
          <Route path="/memories" component={MemoriesPage} />
          <Route path="/moments" component={OurMomentsPage} />
          <Route path="/whisper" component={DailyWhisperPage} />
          <Route path="/notes" component={LoveNotesPage} />
          <Route path="/prayers" component={PrayersPage} />
          <Route path="/settings" component={SettingsPage} />
          <Route path="/" component={ChatPage} />
        </Switch>
      </div>

      <nav className="border-t bg-card/80 backdrop-blur-sm px-2 py-2 flex-shrink-0" style={{ paddingBottom: 'var(--safe-area-inset-bottom)' }}>
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
      <DodiProvider>
        <OnboardingProvider>
          <TooltipProvider>
            <MainApp />
            <Toaster />
          </TooltipProvider>
        </OnboardingProvider>
      </DodiProvider>
    </QueryClientProvider>
  );
}
