import { useState } from 'react';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { Button } from '@/components/ui/button';
import { Heart, Lock, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const screens = [
  {
    title: 'Welcome to Dodi',
    subtitle: 'Your private garden for two',
    description: 'Your whispers stay only between you two — forever. Encrypted on your devices, never touching a server. No leaks possible.',
    icon: Heart,
    iconColor: 'text-accent',
  },
  {
    title: 'Completely Private',
    subtitle: '100% Direct Peer-to-Peer',
    description: 'Everything flows directly between your devices alone. Even we cannot see your data. Your connection is yours alone — forever.',
    icon: Lock,
    iconColor: 'text-primary',
  },
];

export default function OnboardingPage() {
  const { skipTutorial } = useOnboarding();
  const [step, setStep] = useState(0);

  const current = screens[step];
  const isLast = step === screens.length - 1;

  const handleNext = async () => {
    if (isLast) {
      await skipTutorial();
    } else {
      setStep(step + 1);
    }
  };

  const Icon = current.icon;

  return (
    <div className="w-screen h-screen flex flex-col bg-gradient-to-b from-background to-card/30" style={{ minHeight: '100dvh' }}>
      <div className="flex-1 flex flex-col items-center justify-center px-8 gap-8">
        <div className={cn(
          'w-28 h-28 rounded-full bg-card border-2 flex items-center justify-center animate-gentle-pulse',
          current.iconColor
        )}>
          <Icon className="w-14 h-14" />
        </div>

        <div className="text-center max-w-sm space-y-3">
          <h1 className="text-3xl font-light text-foreground">{current.title}</h1>
          <p className="text-lg text-primary font-medium">{current.subtitle}</p>
          <p className="text-base text-muted-foreground leading-relaxed">
            {current.description}
          </p>
        </div>

        <div className="flex gap-2">
          {screens.map((_, idx) => (
            <div
              key={idx}
              className={cn(
                'h-2 rounded-full transition-all',
                idx === step ? 'bg-primary w-8' : 'bg-muted w-2'
              )}
            />
          ))}
        </div>
      </div>

      <div className="flex-shrink-0 p-6">
        <Button
          onClick={handleNext}
          className="w-full"
          size="lg"
          data-testid={isLast ? 'button-get-started' : 'button-next'}
        >
          {isLast ? 'Get Started' : 'Next'}
          <ChevronRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
