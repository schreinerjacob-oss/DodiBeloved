import { useState, useEffect } from 'react';
import { useDodi } from '@/contexts/DodiContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Heart, Sparkles, Shield, Check, Star, Infinity, ArrowLeft } from 'lucide-react';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';

export default function SubscriptionPage() {
  const { isPremium, setPremiumStatus } = useDodi();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const handleSupport = async (tier: string) => {
    // In a real app, this would trigger Stripe
    // For now, we simulate success
    await setPremiumStatus(true);
    toast({
      title: "Thank you for your support!",
      description: `Your garden is now eternally supported. Your gift of ${tier} keeps this sanctuary alive.`,
    });
    setLocation('/settings');
  };

  const handleRestore = async () => {
    // Check if we already have it in local storage
    if (isPremium) {
      toast({
        title: "Garden Restored",
        description: "Your sanctuary was already verified.",
      });
    } else {
      // Simulate verification
      toast({
        title: "Checking records...",
        duration: 2000,
      });
      setTimeout(async () => {
        await setPremiumStatus(true);
        toast({
          title: "Restoration Complete",
          description: "Your eternal support has been restored.",
        });
      }, 2000);
    }
  };

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="px-6 py-4 border-b bg-card/50 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation('/settings')} className="hover-elevate">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h2 className="text-xl font-light text-foreground">Support the Garden</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Keep dodi alive for couples everywhere
          </p>
        </div>
      </div>

      <ScrollArea className="flex-1 p-6">
        <div className="max-w-md mx-auto space-y-8 pb-8">
          <div className="text-center space-y-4">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-accent/10 mb-2">
              <Heart className="w-8 h-8 text-accent animate-pulse" />
            </div>
            <h1 className="text-3xl font-serif text-foreground leading-tight">
              Support Your Private Sanctuary
            </h1>
            <p className="text-muted-foreground leading-relaxed">
              Dodi is 100% free to use. Everything works without supporting. 
              Your support keeps this space safe, ad-free, and alive for couples everywhere.
            </p>
          </div>

          <div className="grid gap-4">
            {/* Lifetime tier made most prominent */}
            <Card className="p-6 border-accent/40 bg-accent/5 relative overflow-hidden group hover-elevate transition-all ring-2 ring-accent/20">
              <div className="absolute top-0 right-0 p-3">
                <Infinity className="w-6 h-6 text-accent fill-accent/10" />
              </div>
              <div className="space-y-4">
                <div>
                  <h3 className="text-2xl font-serif text-foreground">Support Forever</h3>
                  <p className="text-sm text-muted-foreground italic">Lifetime Access</p>
                </div>
                <div className="text-4xl font-serif text-accent">$79.00</div>
                <ul className="space-y-2">
                  {[
                    "Keep your garden private forever",
                    "All future features included",
                    "No servers, no tracking, ever",
                    "Badge of Eternal Support"
                  ].map((feat, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <Check className="w-4 h-4 text-sage" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
                <Button 
                  className="w-full bg-accent hover:bg-accent/90 text-white font-medium h-12 text-lg shadow-lg shadow-accent/20" 
                  onClick={() => handleSupport('Forever')}
                >
                  Gift Lifetime Support
                </Button>
              </div>
            </Card>

            <div className="grid grid-cols-2 gap-4">
              <Card className="p-6 space-y-4 hover-elevate transition-all border-muted/50">
                <div>
                  <h3 className="text-sm font-serif text-muted-foreground uppercase tracking-wider">Yearly</h3>
                  <p className="text-2xl font-serif text-foreground">$29.99</p>
                </div>
                <Button variant="outline" className="w-full text-xs" onClick={() => handleSupport('Yearly')}>
                  Support Yearly
                </Button>
              </Card>
              <Card className="p-6 space-y-4 hover-elevate transition-all border-muted/50">
                <div>
                  <h3 className="text-sm font-serif text-muted-foreground uppercase tracking-wider">Monthly</h3>
                  <p className="text-2xl font-serif text-foreground">$2.99</p>
                </div>
                <Button variant="outline" className="w-full text-xs" onClick={() => handleSupport('Monthly')}>
                  Support Monthly
                </Button>
              </Card>
            </div>
          </div>

          <div className="space-y-6">
            <Card className="p-4 border-sage/20 bg-sage/5 text-center">
              <p className="text-sm text-muted-foreground">
                <strong className="text-foreground">Dodi is completely free.</strong> No paywall, no premium features behind a gate. Support is optional and appreciated.
              </p>
            </Card>
            <div className="text-center space-y-2">
              <h3 className="text-sm font-medium">Why support?</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                By supporting Dodi, you're not just buying an app. You're helping build a future where 
                intimate connection doesn't require digital surveillance. Your support pays for 
                the development of this secure P2P technology.
              </p>
            </div>

            <Card className="p-6 border-sage/20 bg-sage/5 space-y-4">
              <div className="flex items-center gap-3">
                <Shield className="w-5 h-5 text-sage" />
                <h3 className="font-medium text-sage">The Dodi Privacy Promise</h3>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed italic">
                "We don't sell your data because we don't even have it. Your whispers stay 
                only between you two — forever."
              </p>
            </Card>
          </div>

          <div className="text-center">
            <Button variant="ghost" className="text-muted-foreground text-xs" onClick={handleRestore}>
              Already supported? <span className="underline ml-1">One-tap restore</span>
            </Button>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}