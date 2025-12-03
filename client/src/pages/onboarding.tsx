import { useState } from 'react';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MessageSquare, Heart, Camera, CalendarDays, Sparkles, Lock, Phone, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TutorialStep {
  id: number;
  title: string;
  description: string;
  icon: any;
  color: string;
  action: string;
}

const tutorialSteps: TutorialStep[] = [
  {
    id: 0,
    title: 'Welcome to Dodi',
    description: 'Your private space to connect with your beloved. Everything stays between you two—100% peer-to-peer.',
    icon: Heart,
    color: 'text-accent',
    action: 'Next',
  },
  {
    id: 1,
    title: 'Chat Together',
    description: 'Send encrypted messages instantly. See typing indicators and delivery receipts in real-time.',
    icon: MessageSquare,
    color: 'text-primary',
    action: 'Next',
  },
  {
    id: 2,
    title: 'Share Memories',
    description: 'Capture and store photos together. Your memories are encrypted and only you can access.',
    icon: Camera,
    color: 'text-chart-2',
    action: 'Next',
  },
  {
    id: 3,
    title: 'Calendar of Love',
    description: 'Mark anniversaries, dates, and special moments. Never miss what matters most.',
    icon: CalendarDays,
    color: 'text-chart-3',
    action: 'Next',
  },
  {
    id: 4,
    title: 'Daily Ritual',
    description: 'Share daily gratitude and dreams. Check in with each other every morning and evening.',
    icon: Sparkles,
    color: 'text-primary',
    action: 'Next',
  },
  {
    id: 5,
    title: 'Prayers & Gratitude',
    description: 'Write sacred moments together. Reveal prayers simultaneously for intimate connection.',
    icon: Lock,
    color: 'text-accent',
    action: 'Next',
  },
  {
    id: 6,
    title: 'Video Calls',
    description: 'See each other face-to-face with end-to-end encryption. Stay connected no matter where.',
    icon: Phone,
    color: 'text-primary',
    action: 'Next',
  },
  {
    id: 7,
    title: 'Quick Reactions',
    description: 'Send instant love with emojis and reactions. Celebrate the small moments.',
    icon: Sparkles,
    color: 'text-chart-1',
    action: 'Get Started',
  },
];

export default function OnboardingPage() {
  const { skipTutorial, completeStep, currentStep } = useOnboarding();
  const [step, setStep] = useState(currentStep >= tutorialSteps.length ? 0 : currentStep);

  const currentTutorial = tutorialSteps[step];
  const progress = Math.round(((step + 1) / tutorialSteps.length) * 100);

  const handleNext = async () => {
    if (step < tutorialSteps.length - 1) {
      const nextStep = step + 1;
      setStep(nextStep);
      await completeStep(nextStep);
    } else {
      await skipTutorial();
    }
  };

  const handleSkip = async () => {
    await skipTutorial();
  };

  const Icon = currentTutorial.icon;

  return (
    <div className="w-screen h-screen flex flex-col bg-gradient-to-b from-background to-card/30" style={{ minHeight: '100dvh' }}>
      {/* Header */}
      <div className="flex-shrink-0 p-6 flex items-center justify-between border-b">
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon"
          onClick={handleSkip}
          className="hover-elevate"
          data-testid="button-skip-tutorial"
        >
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-8">
        {/* Icon */}
        <div className={cn(
          'w-24 h-24 rounded-full bg-card border-2 flex items-center justify-center animate-gentle-pulse',
          currentTutorial.color
        )}>
          <Icon className="w-12 h-12" />
        </div>

        {/* Text */}
        <div className="text-center max-w-md space-y-3">
          <h2 className="text-3xl font-light text-foreground">{currentTutorial.title}</h2>
          <p className="text-base text-muted-foreground leading-relaxed">
            {currentTutorial.description}
          </p>
        </div>

        {/* Steps Indicator */}
        <div className="w-full max-w-xs space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Step {step + 1} of {tutorialSteps.length}</span>
            <span>{progress}%</span>
          </div>
          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 p-6 space-y-3 border-t">
        <Button
          onClick={handleNext}
          className="w-full"
          size="lg"
          data-testid={`button-tutorial-${step < tutorialSteps.length - 1 ? 'next' : 'done'}`}
        >
          {currentTutorial.action}
          <ChevronRight className="w-4 h-4 ml-2" />
        </Button>

        {/* Dots Navigation */}
        <div className="flex justify-center gap-2">
          {tutorialSteps.map((_, idx) => (
            <button
              key={idx}
              onClick={() => {
                setStep(idx);
                completeStep(idx);
              }}
              className={cn(
                'h-2 rounded-full transition-all',
                idx === step ? 'bg-primary w-6' : 'bg-muted w-2 hover-elevate'
              )}
              data-testid={`button-tutorial-dot-${idx}`}
              aria-label={`Go to step ${idx + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
