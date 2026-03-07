import { useState, useEffect, useRef } from 'react';
import { useDodi } from '@/contexts/DodiContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Lock, LogOut, X, ScanFace } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Capacitor } from '@capacitor/core';
import { getNativeSetting } from '@/lib/capacitor-preferences';
import { hapticLight, hapticCancel } from '@/lib/haptics';

export default function PinLockPage() {
  const { unlockWithPIN, unlockWithPassphrase, logout } = useDodi();
  
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [biometryAvailable, setBiometryAvailable] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    import('@aparajita/capacitor-biometric-auth').then(({ BiometricAuth }) => {
      BiometricAuth.checkBiometry().then((r) => setBiometryAvailable(r.isAvailable)).catch(() => {});
    }).catch(() => {});
  }, []);

  const triggerShake = () => {
    hapticCancel();
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const handlePinChange = (value: string) => {
    const cleaned = value.replace(/\D/g, '').slice(0, 6);
    if (cleaned.length > pin.length) hapticLight();
    setPin(cleaned);
    setError('');
    if (cleaned.length === 6) {
      setTimeout(() => submitPin(cleaned), 80);
    }
  };

  const submitPin = async (value: string) => {
    if (value.length < 4 || value.length > 6) {
      setError('Invalid PIN');
      triggerShake();
      return;
    }
    setLoading(true);
    try {
      const success = await unlockWithPIN(value);
      if (!success) {
        setError('Incorrect PIN');
        setPin('');
        triggerShake();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unlock');
      setPin('');
      triggerShake();
    } finally {
      setLoading(false);
    }
  };

  const handleUnlockPin = () => submitPin(pin);

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

  const handleBiometricUnlock = async () => {
    if (!biometryAvailable) return;
    setLoading(true);
    setError('');
    try {
      const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth');
      await BiometricAuth.authenticate({
        reason: 'Unlock Dodi',
        cancelTitle: 'Cancel',
        allowDeviceCredential: true,
      });
      const storedPin = await getNativeSetting('pin');
      if (storedPin && await unlockWithPIN(storedPin)) {
        // Unlocked
      } else {
        setError('Could not unlock with biometrics');
        triggerShake();
      }
    } catch (e) {
      if (e && typeof (e as { code?: string }).code === 'string' && (e as { code: string }).code !== 'userCancel') {
        setError('Biometric authentication failed');
        triggerShake();
      }
    } finally {
      setLoading(false);
    }
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
          <div className={cn(shake && 'animate-shake')}>
            {/* Dot grid — tapping focuses the hidden input */}
            <div
              className="flex gap-1 cursor-text"
              onClick={() => inputRef.current?.focus()}
            >
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
              ref={inputRef}
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => handlePinChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && isValidPin) {
                  handleUnlockPin();
                }
              }}
              className="w-full mt-2 text-center tracking-widest text-transparent caret-transparent select-none"
              autoComplete="off"
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
        </div>

        <div className="space-y-2">
          {biometryAvailable && (
            <Button
              onClick={handleBiometricUnlock}
              disabled={loading}
              className="w-full h-11"
              variant="secondary"
              data-testid="button-unlock-biometric"
            >
              <ScanFace className="w-4 h-4 mr-2" />
              Use Face ID / Touch ID
            </Button>
          )}
          <Button
            onClick={handleUnlockPin}
            disabled={!isValidPin || loading}
            className="w-full h-11"
            data-testid="button-unlock-pin"
          >
            {loading ? 'Unlocking...' : 'Unlock'}
          </Button>
          <div className="flex gap-2 pt-1">
            <Button
              onClick={() => setShowPassphrase(true)}
              variant="ghost"
              className="flex-1 h-9 text-sm text-muted-foreground"
              disabled={loading}
              data-testid="button-use-passphrase"
            >
              Use Passphrase
            </Button>
            <Button
              onClick={handleLogout}
              variant="ghost"
              className="flex-1 h-9 text-sm text-destructive hover:text-destructive"
              disabled={loading}
              data-testid="button-logout"
            >
              <LogOut className="w-3.5 h-3.5 mr-1.5" />
              Logout
            </Button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground text-center leading-relaxed">
          Auto-locked after 10 minutes of inactivity. Your data is always encrypted locally.
        </p>
      </Card>
    </div>
  );
}
