import { Route, Switch, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DodiProvider, useDodi } from "@/contexts/DodiContext";
import PairingPage from "@/pages/pairing";
import ChatPage from "@/pages/chat";
import MemoriesPage from "@/pages/memories";
import CalendarPage from "@/pages/calendar";
import DailyRitualPage from "@/pages/daily-ritual";
import LoveLettersPage from "@/pages/love-letters";
import FutureLettersPage from "@/pages/future-letters";
import PrayersPage from "@/pages/prayers";
import ReactionsPage from "@/pages/reactions";
import CallsPage from "@/pages/calls";
import SettingsPage from "@/pages/settings";
import SubscriptionPage from "@/pages/subscription";
import { MessageSquare, Camera, CalendarDays, Sparkles, Heart, Clock, Phone, Lock, Settings, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { MoreMenu } from "@/components/more-menu";

function NavItem({ href, icon: Icon, label, active }: { href: string; icon: any; label: string; active: boolean }) {
  const [, setLocation] = useLocation();
  
  return (
    <button
      onClick={() => setLocation(href)}
      className={cn(
        "flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition-all hover-elevate",
        active ? "text-primary" : "text-muted-foreground"
      )}
      data-testid={`nav-${label.toLowerCase()}`}
    >
      <Icon className={cn("w-5 h-5", active && "animate-gentle-bounce")} />
      <span className="text-xs font-medium">{label}</span>
    </button>
  );
}

function MainApp() {
  const { isPaired, isOnline } = useDodi();
  const [location] = useLocation();

  if (!isPaired) {
    return <PairingPage />;
  }

  const mainNavItems = [
    { href: "/chat", icon: MessageSquare, label: "Chat" },
    { href: "/calls", icon: Phone, label: "Calls" },
    { href: "/memories", icon: Camera, label: "Memories" },
    { href: "/calendar", icon: CalendarDays, label: "Calendar" },
  ];

  const moreItems = [
    { href: "/ritual", icon: Sparkles, label: "Ritual" },
    { href: "/letters", icon: Heart, label: "Letters" },
    { href: "/future", icon: Clock, label: "Future" },
    { href: "/prayers", icon: Lock, label: "Prayers" },
    { href: "/reactions", icon: Zap, label: "Reactions" },
    { href: "/settings", icon: Settings, label: "Settings" },
  ];

  return (
    <div className="w-screen flex flex-col bg-background" style={{ minHeight: '100dvh' }}>
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <Switch>
          <Route path="/chat" component={ChatPage} />
          <Route path="/calls" component={CallsPage} />
          <Route path="/memories" component={MemoriesPage} />
          <Route path="/calendar" component={CalendarPage} />
          <Route path="/ritual" component={DailyRitualPage} />
          <Route path="/letters" component={LoveLettersPage} />
          <Route path="/future" component={FutureLettersPage} />
          <Route path="/prayers" component={PrayersPage} />
          <Route path="/reactions" component={ReactionsPage} />
          <Route path="/subscription" component={SubscriptionPage} />
          <Route path="/settings" component={SettingsPage} />
          <Route path="/" component={ChatPage} />
        </Switch>
      </div>

      <nav className="border-t bg-card/80 backdrop-blur-sm px-2 py-2 flex-shrink-0" style={{ paddingBottom: 'var(--safe-area-inset-bottom)' }}>
        <div className="flex items-center justify-between max-w-3xl mx-auto px-2">
          <div className="flex items-center justify-around flex-1">
            {mainNavItems.map((item) => (
              <NavItem
                key={item.href}
                {...item}
                active={location === item.href || (location === "/" && item.href === "/chat")}
              />
            ))}
          </div>
          <MoreMenu items={moreItems} />
        </div>
        <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground mt-1">
          <Lock className="w-3 h-3" />
          <span>{isOnline ? 'Online' : 'Offline'} • Encrypted</span>
        </div>
      </nav>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <DodiProvider>
          <MainApp />
        </DodiProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
