import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Heart, Infinity, Sparkles, X } from 'lucide-react';
import { useDodi } from '@/contexts/DodiContext';
import { useLocation } from 'wouter';
import { cn } from '@/lib/utils';

interface SupportInvitationProps {
  onDismiss?: () => void;
  triggerReason?: string;
}

export function SupportInvitation({ onDismiss, triggerReason }: SupportInvitationProps) {
  const { isPremium, setPremiumStatus } = useDodi();
  const [, setLocation] = useLocation();
  const [showThankYou, setShowThankYou] = useState(false);

  if (isPremium && !showThankYou) return null;

  const handleSupport = (tier: string) => {
    if (tier === 'Eternal') {
      setPremiumStatus(true);
      setShowThankYou(true);
    } else {
      setLocation('/subscription');
    }
  };

  if (showThankYou) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-background/80 backdrop-blur-sm animate-fade-in">
        <Card className="max-w-sm p-8 text-center space-y-6 border-accent/30 shadow-2xl">
          <div className="flex justify-center">
            <div className="w-20 h-20 rounded-full bg-accent/10 flex items-center justify-center">
              <Heart className="w-10 h-10 text-accent animate-gentle-pulse fill-accent" />
            </div>
          </div>
          <h2 className="text-2xl font-serif text-foreground leading-tight">
            Thank you for helping this garden stay safe and alive for couples everywhere ♾️
          </h2>
          <Button 
            className="w-full bg-accent hover:bg-accent/90 text-white" 
            onClick={() => {
              setShowThankYou(false);
              onDismiss?.();
            }}
          >
            Return to Sanctuary
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="fixed inset-x-4 bottom-24 z-[90] animate-in slide-in-from-bottom-4 duration-500">
      <Card className="p-6 bg-gradient-to-br from-sage/10 via-background to-blush/10 border-accent/20 shadow-xl relative overflow-hidden">
        <Button 
          variant="ghost" 
          size="icon" 
          className="absolute top-2 right-2 h-8 w-8 rounded-full"
          onClick={onDismiss}
        >
          <X className="w-4 h-4" />
        </Button>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-accent animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-widest text-accent">
              {triggerReason || 'A beautiful milestone...'}
            </span>
          </div>

          <h3 className="text-xl font-serif text-foreground leading-tight">
            This garden is growing beautifully. Help keep it private and ad-free for couples everywhere?
          </h3>

          <div className="grid gap-3 pt-2">
            <Button 
              className="w-full bg-gold hover:bg-gold/90 text-white font-medium h-12 shadow-lg shadow-gold/20"
              onClick={() => handleSupport('Eternal')}
            >
              <Infinity className="w-4 h-4 mr-2" />
              Eternal Support ($79 — recommended)
            </Button>
            
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" className="h-10 text-xs" onClick={() => handleSupport('Yearly')}>
                Yearly ($29.99)
              </Button>
              <Button variant="outline" className="h-10 text-xs" onClick={() => handleSupport('Monthly')}>
                Monthly ($2.99)
              </Button>
            </div>

            <Button variant="ghost" className="text-muted-foreground text-xs h-8" onClick={onDismiss}>
              Not now
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
