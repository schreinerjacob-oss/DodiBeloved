import { useState } from 'react';
import { useDodi } from '@/contexts/DodiContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Check, Heart, Zap, Infinity } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from '@/hooks/use-toast';

interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  period: string;
  description: string;
  badge?: string;
  icon?: any;
  features: string[];
}

const plans: SubscriptionPlan[] = [
  {
    id: 'monthly',
    name: 'Monthly',
    price: 2.99,
    period: 'month',
    description: 'Keep your garden blooming',
    features: ['Unlimited messages', 'Private memories', 'Shared calendar', 'Daily rituals', 'Love letters', 'No ads ever'],
  },
  {
    id: 'yearly',
    name: 'Yearly',
    price: 29.99,
    period: 'year',
    badge: 'Most Popular',
    icon: Heart,
    description: 'Best value - save $6/year',
    features: ['Everything in Monthly', 'Save $6 vs monthly', 'Priority support'],
  },
  {
    id: 'lifetime',
    name: 'Forever',
    price: 79,
    period: 'one-time',
    badge: 'Forever',
    icon: Infinity,
    description: 'Own your space forever',
    features: ['Everything forever', 'One payment only', 'Lifetime updates', 'Our heartfelt gratitude'],
  },
];

interface SubscriptionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectPlan: (planId: string) => void;
  isLoading?: boolean;
}

export function SubscriptionModal({ open, onOpenChange, onSelectPlan, isLoading }: SubscriptionModalProps) {
  const { toast } = useToast();

  const handleSelectPlan = (planId: string) => {
    onSelectPlan(planId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-light">Your Private Garden is Blooming ✨</DialogTitle>
          <DialogDescription className="text-base mt-2">
            A small fee keeps dodi completely yours, forever—no ads, no tracking, no compromise.
          </DialogDescription>
        </DialogHeader>

        <div className="grid md:grid-cols-3 gap-4 mt-6">
          {plans.map((plan) => {
            const PlanIcon = plan.icon;
            return (
              <Card
                key={plan.id}
                className={`p-6 flex flex-col relative ${
                  plan.id === 'yearly' ? 'ring-2 ring-gold/50 md:scale-105' : ''
                }`}
              >
                {plan.badge && (
                  <Badge className={`absolute top-3 right-3 ${
                    plan.id === 'lifetime' 
                      ? 'bg-gold/30 text-gold border-gold/40' 
                      : 'bg-gold/20 text-gold border-gold/30'
                  }`}>
                    {plan.badge}
                    {PlanIcon && <PlanIcon className="w-3 h-3 ml-1 text-gold" />}
                  </Badge>
                )}
                <div className="mb-4">
                  <h3 className="text-xl font-light">{plan.name}</h3>
                  <div className="flex items-baseline gap-1 mt-2">
                    <span className="text-3xl font-light">${plan.price}</span>
                    <span className="text-sm text-muted-foreground">/{plan.period}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{plan.description}</p>
                </div>

                <div className="flex-1 space-y-2 mb-6">
                  {plan.features.map((feature, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-sm">
                      <Check className="w-4 h-4 text-sage mt-0.5 flex-shrink-0" />
                      <span className="text-muted-foreground">{feature}</span>
                    </div>
                  ))}
                </div>

                <Button
                  onClick={() => handleSelectPlan(plan.id)}
                  disabled={isLoading}
                  className={plan.id === 'yearly' ? 'bg-gold hover:bg-gold/90 text-foreground' : ''}
                  data-testid={`button-select-${plan.id}`}
                >
                  {isLoading ? 'Processing...' : 'Choose Plan'}
                </Button>
              </Card>
            );
          })}
        </div>

        <div className="mt-6 p-4 bg-sage/5 rounded-lg text-sm text-muted-foreground space-y-2">
          <p>💳 Secure payment via Stripe • 🔒 No data collection ever • 🌿 Cancel anytime (yearly/monthly only)</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function SubscriptionPage() {
  const { userId, partnerId } = useDodi();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const { toast } = useToast();

  const handleSelectPlan = async (planId: string) => {
    setSelectedPlan(planId);
    toast({
      title: "Subscription unlocked ✨",
      description: `You and your beloved now have full access with the ${planId} plan`,
    });
    
    // In production: would redirect to Stripe checkout
    // window.location.href = await getStripeCheckoutUrl(planId);
    
    // For now, show that payment was processed
    setTimeout(() => {
      setSelectedPlan(null);
    }, 3000);
  };

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="px-6 py-4 border-b bg-card/50">
        <h2 className="text-xl font-light text-foreground">Subscription Plans</h2>
        <p className="text-xs text-muted-foreground mt-1">Choose your way to keep dodi forever</p>
      </div>

      <ScrollArea className="flex-1 p-6">
        <SubscriptionModal
          open={true}
          onOpenChange={() => {}}
          onSelectPlan={handleSelectPlan}
          isLoading={selectedPlan !== null}
        />
      </ScrollArea>
    </div>
  );
}
