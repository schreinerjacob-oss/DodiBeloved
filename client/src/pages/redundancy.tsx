import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ShieldCheck, Database, RefreshCw, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLocation } from 'wouter';

export default function RedundancyExplainer() {
  const [, setLocation] = useLocation();

  const principles = [
    {
      icon: Database,
      title: "Double-Entry Bookkeeping",
      description: "Every whisper, memory, and prayer is stored in full on both of your devices. There is no 'master' copy - you both hold the complete truth."
    },
    {
      icon: RefreshCw,
      title: "Continuous Reconciliation",
      description: "Whenever you're both online, your devices compare notes. If one was offline, it automatically catches up with the other's latest data."
    },
    {
      icon: Zap,
      title: "Zero-Server Recovery",
      description: "If you lose your phone, your partner's device acts as the source of truth. Pairing a new device mirrors your entire shared history instantly."
    },
    {
      icon: ShieldCheck,
      title: "Redundant Security",
      description: "Because data is on two devices instead of one central server, a breach of one device doesn't expose the other's local archive."
    }
  ];

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-background">
      <ScrollArea className="flex-1 min-h-0 p-6">
        <div className="max-w-2xl mx-auto space-y-6 pb-24">
        <header className="space-y-2">
          <h1 className="text-3xl font-serif text-foreground">The Redundant Garden</h1>
          <p className="text-muted-foreground">
            How Dodi works without a server to keep your space eternal.
          </p>
        </header>

        <Card className="p-8 bg-accent/5 border-accent/20">
          <div className="space-y-8">
            {principles.map((p, idx) => (
              <div key={idx} className="flex gap-4">
                <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                  <p.icon className="w-6 h-6 text-accent" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-medium text-foreground">{p.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {p.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <div className="pt-4">
          <Button 
            variant="outline" 
            className="w-full h-12"
            onClick={() => setLocation('/settings')}
          >
            Return to Settings
          </Button>
        </div>
      </div>
      </ScrollArea>
    </div>
  );
}
