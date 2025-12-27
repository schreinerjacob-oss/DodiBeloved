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
      description: `Your garden is now eternally supported. Level: ${tier}`,
    });
    setLocation('/settings');
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
            Keep dodi private forever
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
              Help keep Dodi private forever for couples everywhere
            </h1>
            <p className="text-muted-foreground leading-relaxed">
              Dodi is built on a promise: total privacy with zero servers. 
              Your support keeps this space safe, ad-free, and evolving for you and your beloved.
            </p>
          </div>

          <div className="grid gap-4">
            <Card className="p-6 border-gold/30 bg-gold/5 relative overflow-hidden group hover-elevate transition-all">
              <div className="absolute top-0 right-0 p-3">
                <Star className="w-6 h-6 text-gold fill-gold/20" />
              </div>
              <div className="space-y-4">
                <div>
                  <h3 className="text-2xl font-serif text-foreground">Lifetime Access</h3>
                  <p className="text-sm text-muted-foreground">Eternally connected</p>
                </div>
                <div className="text-4xl font-serif text-gold">$79.00</div>
                <ul className="space-y-2">
                  {[
                    "One-time payment, forever yours",
                    "All future features included",
                    "Priority support for your sanctuary",
                    "Badge of Eternal Support"
                  ].map((feat, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <Check className="w-4 h-4 text-sage" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
                <Button 
                  className="w-full bg-gold hover:bg-gold/90 text-white font-medium" 
                  onClick={() => handleSupport('Lifetime')}
                >
                  Give Lifetime Support
                </Button>
              </div>
            </Card>

            <div className="grid grid-cols-2 gap-4">
              <Card className="p-6 space-y-4 hover-elevate transition-all">
                <div>
                  <h3 className="text-lg font-serif">Yearly</h3>
                  <p className="text-2xl font-serif text-sage">$29.99</p>
                </div>
                <Button variant="outline" className="w-full" onClick={() => handleSupport('Yearly')}>
                  Support Yearly
                </Button>
              </Card>
              <Card className="p-6 space-y-4 hover-elevate transition-all">
                <div>
                  <h3 className="text-lg font-serif">Monthly</h3>
                  <p className="text-2xl font-serif text-sage">$2.99</p>
                </div>
                <Button variant="outline" className="w-full" onClick={() => handleSupport('Monthly')}>
                  Support Monthly
                </Button>
              </Card>
            </div>
          </div>

          <Card className="p-6 border-sage/20 bg-sage/5 space-y-4">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-sage" />
              <h3 className="font-medium text-sage">The Dodi Privacy Promise</h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed italic">
              "Your support allows us to remain serverless. We don't sell your data because we don't even have it. 
              By supporting the garden, you ensure that intimate spaces remain private in an era of surveillance."
            </p>
          </Card>

          <div className="text-center">
            <Button variant="ghost" className="text-muted-foreground text-xs" onClick={() => setLocation('/settings')}>
              Already supported? Restore purchase
            </Button>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
