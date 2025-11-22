import { useState, useEffect } from 'react';
import { useDodi } from '@/contexts/DodiContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { QRCodeSVG } from 'qrcode.react';
import { Heart, Lock, Copy, Check, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ThemeToggle } from '@/components/theme-toggle';
import dodiTypographyLogo from '@assets/generated_images/hebrew_dodi_typography_logo.png';

export default function PairingPage() {
  const { initializePairing, completePairing } = useDodi();
  const { toast } = useToast();
  const [mode, setMode] = useState<'choose' | 'create' | 'join'>('choose');
  const [pairingData, setPairingData] = useState<{ userId: string; passphrase: string } | null>(null);
  const [partnerPassphrase, setPartnerPassphrase] = useState('');
  const [partnerId, setPartnerId] = useState('');
  const [qrCodeData, setQrCodeData] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleQrCodePaste = (value: string) => {
    setQrCodeData(value);
    if (value.startsWith('dodi:')) {
      const parts = value.replace('dodi:', '').split(':');
      if (parts.length === 2) {
        setPartnerId(parts[0]);
        setPartnerPassphrase(parts[1]);
      }
    }
  };

  const handleCreatePairing = async () => {
    setLoading(true);
    try {
      const data = await initializePairing();
      setPairingData(data);
      setMode('create');
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create pairing. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCopyPassphrase = () => {
    if (pairingData) {
      navigator.clipboard.writeText(`${pairingData.userId}:${pairingData.passphrase}`);
      setCopied(true);
      toast({
        title: "Copied!",
        description: "Share this with your beloved to complete pairing.",
      });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleJoinPairing = async () => {
    if (!partnerId || !partnerPassphrase) {
      toast({
        title: "Missing information",
        description: "Please enter both partner ID and passphrase.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      await completePairing(partnerId, partnerPassphrase);
      toast({
        title: "Paired! 💕",
        description: "Welcome to your private sanctuary.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to complete pairing. Please check your details.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const qrData = pairingData ? `dodi:${pairingData.userId}:${pairingData.passphrase}` : '';

  return (
    <div className="min-h-screen bg-gradient-to-br from-cream via-sage/10 to-blush/20 dark:from-background dark:via-card dark:to-secondary flex items-center justify-center p-6">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md space-y-8 animate-fade-in">
        <div className="text-center space-y-3">
          <div className="inline-block mb-2">
            <img src={dodiTypographyLogo} alt="dodi" className="h-20" />
          </div>
          <h1 className="text-4xl font-light tracking-wide text-foreground">dodi</h1>
          <p className="text-muted-foreground font-light">my beloved</p>
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Lock className="w-4 h-4" />
            <span>End-to-end encrypted • Private forever</span>
          </div>
        </div>

        {mode === 'choose' && (
          <Card className="p-8 space-y-6 border-sage/30">
            <div className="space-y-3 text-center">
              <Sparkles className="w-8 h-8 mx-auto text-gold animate-pulse-glow" />
              <h2 className="text-2xl font-light">Create Your Sacred Space</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                A completely private, encrypted sanctuary that belongs only to you and your beloved.
              </p>
            </div>

            <div className="space-y-3">
              <Button
                onClick={handleCreatePairing}
                disabled={loading}
                className="w-full h-12 text-base"
                data-testid="button-create-pairing"
              >
                <Heart className="w-5 h-5 mr-2" />
                Create New Connection
              </Button>

              <Button
                onClick={() => setMode('join')}
                variant="outline"
                className="w-full h-12 text-base"
                data-testid="button-join-pairing"
              >
                Join Existing Connection
              </Button>
            </div>
          </Card>
        )}

        {mode === 'create' && pairingData && (
          <Card className="p-8 space-y-6 border-sage/30">
            <div className="text-center space-y-2">
              <Heart className="w-8 h-8 mx-auto text-accent animate-gentle-bounce" />
              <h2 className="text-xl font-light">Share With Your Beloved</h2>
              <p className="text-sm text-muted-foreground">
                Scan this QR code or share the passphrase
              </p>
            </div>

            <div className="flex justify-center p-6 bg-white rounded-lg">
              <QRCodeSVG
                value={qrData}
                size={200}
                level="H"
                includeMargin
                data-testid="qr-code"
              />
            </div>

            <div className="space-y-3">
              <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                <p className="text-xs text-muted-foreground font-medium">YOUR ID</p>
                <p className="text-sm font-mono break-all" data-testid="text-user-id">{pairingData.userId}</p>
              </div>

              <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                <p className="text-xs text-muted-foreground font-medium">PASSPHRASE</p>
                <p className="text-sm font-mono" data-testid="text-passphrase">{pairingData.passphrase}</p>
              </div>

              <Button
                onClick={handleCopyPassphrase}
                variant="outline"
                className="w-full"
                data-testid="button-copy"
              >
                {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                {copied ? 'Copied!' : 'Copy Pairing Details'}
              </Button>
            </div>

            <p className="text-xs text-center text-muted-foreground leading-relaxed">
              Once your beloved enters this information, your private space will be ready.
            </p>
          </Card>
        )}

        {mode === 'join' && (
          <Card className="p-8 space-y-6 border-sage/30">
            <div className="text-center space-y-2">
              <Heart className="w-8 h-8 mx-auto text-accent" />
              <h2 className="text-xl font-light">Join Your Beloved</h2>
              <p className="text-sm text-muted-foreground">
                Paste the QR code or enter details they shared
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="qr-code" className="text-sm font-medium">
                  Scan QR Code or Paste String
                </label>
                <Input
                  id="qr-code"
                  placeholder="dodi:userId:passphrase or scan camera"
                  value={qrCodeData}
                  onChange={(e) => handleQrCodePaste(e.target.value)}
                  className="font-mono"
                  data-testid="input-qr-code"
                />
                <p className="text-xs text-muted-foreground">
                  Auto-fills Partner ID and Passphrase when QR code is detected
                </p>
              </div>

              <div className="space-y-2">
                <label htmlFor="partner-id" className="text-sm font-medium">
                  Partner ID
                </label>
                <Input
                  id="partner-id"
                  placeholder="Enter their ID"
                  value={partnerId}
                  onChange={(e) => setPartnerId(e.target.value)}
                  className="font-mono"
                  data-testid="input-partner-id"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="passphrase" className="text-sm font-medium">
                  Shared Passphrase
                </label>
                <Input
                  id="passphrase"
                  placeholder="word-word-word-word"
                  value={partnerPassphrase}
                  onChange={(e) => setPartnerPassphrase(e.target.value)}
                  className="font-mono"
                  data-testid="input-passphrase"
                />
              </div>

              <Button
                onClick={handleJoinPairing}
                disabled={loading || !partnerId || !partnerPassphrase}
                className="w-full h-12 text-base"
                data-testid="button-complete-pairing"
              >
                Complete Pairing
              </Button>

              <Button
                onClick={() => {
                  setMode('choose');
                  setQrCodeData('');
                  setPartnerId('');
                  setPartnerPassphrase('');
                }}
                variant="ghost"
                className="w-full"
                data-testid="button-back"
              >
                Back
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
