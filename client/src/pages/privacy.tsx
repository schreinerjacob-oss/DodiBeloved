import { Button } from '@/components/ui/button';
import { ShieldCheck } from 'lucide-react';
import { useLocation } from 'wouter';

export default function PrivacyPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen w-screen bg-background flex flex-col">
      <div className="flex-shrink-0 h-14 flex items-center justify-between px-4 border-b border-black/10 dark:border-white/8 bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-accent" />
          <h2 className="text-lg font-heading font-semibold text-foreground">Privacy Policy</h2>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setLocation('/chat')} data-testid="button-back-to-app">
          Back
        </Button>
      </div>

      <div className="flex-1 min-h-0">
        <iframe
          title="dodi privacy policy"
          src="/privacy.html"
          className="w-full h-full border-0"
        />
      </div>
    </div>
  );
}

