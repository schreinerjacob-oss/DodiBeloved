import { useState } from 'react';
import { useDodi } from '@/contexts/DodiContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Lock, Check, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface PinSetupProps {
  onComplete: () => void;
}

export default function PinSetupPage({ onComplete }: PinSetupProps) {
  const { setPIN, skipPINSetup } = useDodi();
  const { toast } = useToast();
  
  const [step, setStep] = useState<'entry' | 'confirm'>('entry');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  console.log('🔐 [PIN SETUP] Page rendered');

  const handlePinChange = (value: string) => {
    const cleaned = value.replace(/\D/g, '').slice(0, 6);
    if (step === 'entry') {
      setPin(cleaned);
      setError('');
    } else {
      setConfirmPin(cleaned);
      setError('');
    }
  };

  const validatePin = (value: string): boolean => {
    if (value.length < 4 || value.length > 6) {
      setError('PIN must be 4-6 digits');
      return false;
    }
    return true;
  };

  const handleNext = async () => {
    if (!validatePin(pin)) return;
    setStep('confirm');
    setConfirmPin('');
  };

  const handleConfirm = async () => {
    if (!validatePin(confirmPin)) return;
    
    if (pin !== confirmPin) {
      setError('PINs do not match');
      return;
    }

    setLoading(true);
    try {
      console.log('🔐 [PIN SETUP] Setting PIN...');
      await setPIN(pin);
      console.log('✅ [PIN SETUP] PIN set successfully, calling onComplete');
      toast({
        title: 'PIN Set!',
        description: 'Your app is now protected with a PIN.',
      });
      onComplete();
    } catch (err) {
      console.error('❌ [PIN SETUP] Failed to set PIN:', err);
      setError(err instanceof Error ? err.message : 'Failed to set PIN');
      toast({
        title: 'Error',
        description: 'Failed to set PIN. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    skipPINSetup();
    onComplete();
  };

  const handleBack = () => {
    setStep('entry');
    setConfirmPin('');
    setError('');
  };

  const isValidPin = (value: string) => value.length >= 4 && value.length <= 6;

  return (
    <div className="min-h-screen bg-gradient-to-br from-cream via-sage/10 to-blush/20 dark:from-background dark:via-card dark:to-secondary flex items-center justify-center p-6">
      <Card className="w-full max-w-md p-8 space-y-6 border-sage/30">
        <div className="space-y-3 text-center">
          <div className="flex justify-center mb-3">
            <Lock className="w-12 h-12 text-gold animate-pulse-glow" />
          </div>
          <h1 className="text-2xl font-light tracking-wide">Quick Lock</h1>
          <p className="text-sm text-muted-foreground">
            {step === 'entry'
              ? 'Set a 4-6 digit PIN for quick app access'
              : 'Confirm your PIN'}
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground">
              {step === 'entry' ? 'Enter PIN' : 'Confirm PIN'}
            </label>
            <div className="flex gap-1 mt-2">
              {Array.from({ length: 6 }).map((_, i) => {
                const value = step === 'entry' ? pin : confirmPin;
                const digit = value[i] || '';
                return (
                  <div
                    key={i}
                    className={cn(
                      'flex-1 h-12 rounded-md border-2 flex items-center justify-center font-bold text-lg transition-all',
                      digit
                        ? 'border-gold bg-gold/10 text-gold'
                        : 'border-sage/30 bg-transparent text-muted-foreground'
                    )}
                  >
                    {digit && '•'}
                  </div>
                );
              })}
            </div>
            <Input
              type="text"
              inputMode="numeric"
              placeholder="0000"
              value={step === 'entry' ? pin : confirmPin}
              onChange={(e) => handlePinChange(e.target.value)}
              className="mt-3 text-center tracking-widest opacity-0 absolute pointer-events-none"
              data-testid="input-pin"
              autoFocus
            />
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="Enter PIN"
              value={step === 'entry' ? pin : confirmPin}
              onChange={(e) => handlePinChange(e.target.value)}
              className="w-full mt-3 text-center tracking-widest"
              data-testid="input-pin-actual"
            />
          </div>

          {error && (
            <div className="flex gap-2 text-sm text-destructive">
              <X className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {(step === 'entry' ? isValidPin(pin) : isValidPin(confirmPin)) && (
            <div className="flex gap-2 text-sm text-emerald-600 dark:text-emerald-400">
              <Check className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>Valid PIN</span>
            </div>
          )}
        </div>

        <div className="space-y-2">
          {step === 'entry' ? (
            <>
              <Button
                onClick={handleNext}
                disabled={!isValidPin(pin) || loading}
                className="w-full h-11"
                data-testid="button-pin-next"
              >
                Next
              </Button>
              <Button
                onClick={handleSkip}
                variant="outline"
                className="w-full h-11"
                data-testid="button-pin-skip"
              >
                Skip for now
              </Button>
            </>
          ) : (
            <>
              <Button
                onClick={handleConfirm}
                disabled={!isValidPin(confirmPin) || loading}
                className="w-full h-11"
                data-testid="button-pin-confirm"
              >
                {loading ? 'Setting...' : 'Confirm PIN'}
              </Button>
              <Button
                onClick={handleBack}
                variant="outline"
                className="w-full h-11"
                disabled={loading}
                data-testid="button-pin-back"
              >
                Back
              </Button>
            </>
          )}
        </div>

        <p className="text-xs text-muted-foreground text-center leading-relaxed">
          You can use your full passphrase to unlock if you forget your PIN. This PIN is encrypted and never shared.
        </p>
      </Card>
    </div>
  );
}
