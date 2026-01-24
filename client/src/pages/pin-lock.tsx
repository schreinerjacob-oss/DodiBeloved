import { useState } from 'react';
import { useDodi } from '@/contexts/DodiContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Lock, LogOut, X, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export default function PinLockPage() {
  const { unlockWithPIN, unlockWithPassphrase, logout } = useDodi();
  const { toast } = useToast();
  
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [passphrase, setPassphrase] = useState('');

  const handlePinChange = (value: string) => {
    const cleaned = value.replace(/\D/g, '').slice(0, 6);
    setPin(cleaned);
    setError('');
  };

  const handleUnlockPin = async () => {
    if (pin.length < 4 || pin.length > 6) {
      setError('Invalid PIN');
      return;
    }

    setLoading(true);
    try {
      const success = await unlockWithPIN(pin);
      if (!success) {
        setError('Incorrect PIN');
        setPin('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unlock');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  const handleUnlockPassphrase = async () => {
    if (!passphrase.trim()) {
      setError('Enter your passphrase');
      return;
    }

    setLoading(true);
    try {
      const success = await unlockWithPassphrase(passphrase);
      if (!success) {
        setError('Incorrect passphrase');
        setPassphrase('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unlock');
      setPassphrase('');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
  };

  const isValidPin = pin.length >= 4 && pin.length <= 6;

  if (showPassphrase) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-cream via-sage/10 to-blush/20 dark:from-background dark:via-card dark:to-secondary flex items-center justify-center p-6">
        <Card className="w-full max-w-md p-8 space-y-6 border-sage/30">
          <div className="space-y-3 text-center">
            <div className="flex justify-center mb-3">
              <Lock className="w-12 h-12 text-gold animate-pulse-glow" />
            </div>
            <h1 className="text-2xl font-light tracking-wide">Unlock with Passphrase</h1>
            <p className="text-sm text-muted-foreground">Enter your full passphrase</p>
          </div>

          <div className="space-y-4">
            <div>
              <Input
                type="password"
                placeholder="Enter passphrase"
                value={passphrase}
                onChange={(e) => {
                  setPassphrase(e.target.value);
                  setError('');
                }}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && passphrase.trim()) {
                    handleUnlockPassphrase();
                  }
                }}
                className="h-11"
                data-testid="input-passphrase"
                disabled={loading}
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
            <Button
              onClick={handleUnlockPassphrase}
              disabled={!passphrase.trim() || loading}
              className="w-full h-11"
              data-testid="button-unlock-passphrase"
            >
              {loading ? 'Unlocking...' : 'Unlock'}
            </Button>
            <Button
              onClick={() => {
                setShowPassphrase(false);
                setPassphrase('');
                setError('');
              }}
              variant="outline"
              className="w-full h-11"
              disabled={loading}
              data-testid="button-back-to-pin"
            >
              Back to PIN
            </Button>
            <Button
              onClick={handleLogout}
              variant="ghost"
              className="w-full h-11 text-destructive hover:text-destructive"
              disabled={loading}
              data-testid="button-logout-lock"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-cream via-sage/10 to-blush/20 dark:from-background dark:via-card dark:to-secondary flex items-center justify-center p-6">
      <Card className="w-full max-w-md p-8 space-y-6 border-sage/30">
        <div className="space-y-3 text-center">
          <div className="flex justify-center mb-3">
            <Lock className="w-12 h-12 text-gold animate-pulse-glow" />
          </div>
          <h1 className="text-2xl font-light tracking-wide">Your Private Space</h1>
          <p className="text-sm text-muted-foreground">Enter PIN to continue</p>
        </div>

        <div className="space-y-4">
          <div>
            <div className="flex gap-1">
              {Array.from({ length: 6 }).map((_, i) => {
                const digit = pin[i] || '';
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
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="Enter PIN"
              value={pin}
              onChange={(e) => handlePinChange(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && isValidPin) {
                  handleUnlockPin();
                }
              }}
              className="w-full mt-3 text-center tracking-widest"
              data-testid="input-pin-lock"
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

          {isValidPin && !error && (
            <div className="flex gap-2 text-sm text-emerald-600 dark:text-emerald-400">
              <Check className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>Ready to unlock</span>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Button
            onClick={handleUnlockPin}
            disabled={!isValidPin || loading}
            className="w-full h-11"
            data-testid="button-unlock-pin"
          >
            {loading ? 'Unlocking...' : 'Unlock'}
          </Button>
          <Button
            onClick={() => setShowPassphrase(true)}
            variant="outline"
            className="w-full h-11"
            disabled={loading}
            data-testid="button-use-passphrase"
          >
            Use Passphrase Instead
          </Button>
          <Button
            onClick={handleLogout}
            variant="ghost"
            className="w-full h-11 text-destructive hover:text-destructive"
            disabled={loading}
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>

        <p className="text-xs text-muted-foreground text-center leading-relaxed">
          Auto-locked after 10 minutes of inactivity. Your data is always encrypted locally.
        </p>
      </Card>
    </div>
  );
}
