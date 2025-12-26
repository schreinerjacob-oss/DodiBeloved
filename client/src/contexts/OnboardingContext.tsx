import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { saveSetting, getSetting, initDB } from '@/lib/storage-encrypted';

interface OnboardingContextType {
  hasSeenTutorial: boolean;
  currentStep: number;
  completeStep: (step: number) => Promise<void>;
  skipTutorial: () => Promise<void>;
  resetTutorial: () => Promise<void>;
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [hasSeenTutorial, setHasSeenTutorial] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const loadTutorialState = async () => {
      try {
        const seen = await getSetting('hasSeenTutorial');
        const step = await getSetting('tutorialStep');
        
        const seenObj = seen as any;
        if (seenObj && typeof seenObj === 'object' && 'value' in seenObj && (seenObj.value === 'true' || seenObj.value === true)) {
          setHasSeenTutorial(true);
        }
        
        const stepObj = step as any;
        if (stepObj && typeof stepObj === 'object' && 'value' in stepObj && stepObj.value) {
          setCurrentStep(parseInt(stepObj.value as string) || 0);
        }
      } catch (err) {
        console.error('Failed to load tutorial state:', err);
      }
    };

    loadTutorialState();
  }, []);

  const completeStep = async (step: number) => {
    setCurrentStep(step);
    await saveSetting('tutorialStep', step.toString());
  };

  const skipTutorial = async () => {
    setHasSeenTutorial(true);
    await saveSetting('hasSeenTutorial', 'true');
    await saveSetting('tutorialStep', '999'); // Mark as completed
  };

  const resetTutorial = async () => {
    setHasSeenTutorial(false);
    setCurrentStep(0);
    await saveSetting('hasSeenTutorial', 'false');
    await saveSetting('tutorialStep', '0');
  };

  return (
    <OnboardingContext.Provider
      value={{ hasSeenTutorial, currentStep, completeStep, skipTutorial, resetTutorial }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error('useOnboarding must be used within OnboardingProvider');
  }
  return context;
}
