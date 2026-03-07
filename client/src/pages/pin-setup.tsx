import { useState, useRef, useEffect } from 'react';
import { useDodi } from '@/contexts/DodiContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Lock, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { hapticLight } from '@/lib/haptics';

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
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [step]);

  const handlePinChange = (value: string) => {
    const cleaned = value.replace(/\D/g, '').slice(0, 6);
    if (step === 'entry') {
      if (cleaned.length > pin.length) hapticLight();
      setPin(cleaned);
      setError('');
      if (cleaned.length >= 4 && cleaned.length <= 6 && cleaned.length === 6) {
        // Auto-advance to confirm on max length
        setTimeout(() => advanceToConfirm(cleaned), 80);
      }
    } else {
      if (cleaned.length > confirmPin.length) hapticLight();
      setConfirmPin(cleaned);
      setError('');
      if (cleaned.length >= 4 && cleaned.length <= 6 && cleaned.length === 6) {
        setTimeout(() => submitConfirm(cleaned), 80);
      }
    }
  };

  const advanceToConfirm = (value: string) => {
    if (value.length < 4) { setError('PIN must be 4-6 digits'); return; }
    setStep('confirm');
    setConfirmPin('');
  };

  const handleNext = () => {
    advanceToConfirm(pin);
  };

  const submitConfirm = async (value: string) => {
    if (value.length < 4) { setError('PIN must be 4-6 digits'); return; }
    if (pin !== value) {
      setError('PINs do not match');
      setConfirmPin('');
      return;
    }
    setLoading(true);
    try {
      await setPIN(pin);
      toast({ title: 'PIN Set!', description: 'Your app is now protected with a PIN.' });
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set PIN');
      toast({ title: 'Error', description: 'Failed to set PIN. Please try again.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    submitConfirm(confirmPin);
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
  const currentValue = step === 'entry' ? pin : confirmPin;

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-background h-full w-full overflow-y-auto" style={{ minHeight: '100dvh' }}>
      <Card className="w-full max-w-sm p-8 space-y-6 border-sage/30 shadow-none bg-transparent">
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
            {/* Dot grid — tapping it focuses the hidden input */}
            <div
              className="flex gap-1 mt-2 cursor-text"
              onClick={() => inputRef.current?.focus()}
            >
              {Array.from({ length: 6 }).map((_, i) => {
                const digit = currentValue[i] || '';
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
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={currentValue}
              onChange={(e) => handlePinChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  step === 'entry' ? handleNext() : handleConfirm();
                }
              }}
              className="w-full mt-2 text-center tracking-widest text-transparent caret-transparent select-none"
              autoComplete="off"
              data-testid="input-pin"
              disabled={loading}
              autoFocus
            />
          </div>

          {error && (
            <div className="flex gap-2 text-sm text-destructive">
              <X className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
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
                variant="ghost"
                className="w-full h-11 text-muted-foreground"
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
