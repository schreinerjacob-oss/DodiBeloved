import { useState, useEffect, useRef } from 'react';
import { useDodi } from '@/contexts/DodiContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { QRCodeSVG } from 'qrcode.react';
import { Heart, Lock, Copy, Check, Sparkles, Camera, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ThemeToggle } from '@/components/theme-toggle';
import dodiTypographyLogo from '@assets/generated_images/hebrew_dodi_typography_logo.png';
import { Html5QrcodeScanner } from 'html5-qrcode';

export default function PairingPage() {
  const { initializePairing, completePairing } = useDodi();
  const { toast } = useToast();
  const [mode, setMode] = useState<'choose' | 'create' | 'join' | 'scan'>('choose');
  const [pairingData, setPairingData] = useState<{ userId: string; passphrase: string } | null>(null);
  const [partnerPassphrase, setPartnerPassphrase] = useState('');
  const [partnerId, setPartnerId] = useState('');
  const [qrCodeData, setQrCodeData] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const [scannerInitialized, setScannerInitialized] = useState(false);

  useEffect(() => {
    if (mode === 'scan' && !scannerInitialized) {
      initializeScanner();
    }

    return () => {
      if (scannerRef.current && mode !== 'scan') {
        try {
          scannerRef.current.clear();
        } catch (e) {
          console.log('Scanner cleanup:', e);
        }
      }
    };
  }, [mode, scannerInitialized]);

  const initializeScanner = async () => {
    try {
      const scanner = new Html5QrcodeScanner(
        'qr-reader',
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1,
        },
        false
      );

      scanner.render(
        (decodedText) => {
          if (decodedText.startsWith('dodi:')) {
            handleScanSuccess(decodedText);
            scanner.clear();
            setScannerInitialized(false);
          }
        },
        () => {}
      );

      scannerRef.current = scanner;
      setScannerInitialized(true);
    } catch (err) {
      toast({
        title: 'Camera Error',
        description: 'Could not access camera. Please check permissions.',
        variant: 'destructive',
      });
      setMode('join');
    }
  };

  const handleScanSuccess = (data: string) => {
    const parts = data.replace('dodi:', '').split(':');
    if (parts.length === 2) {
      setPartnerId(parts[0]);
      setPartnerPassphrase(parts[1]);
      setQrCodeData(data);
      toast({
        title: 'QR Code Scanned!',
        description: 'Pairing details loaded. Ready to connect.',
      });
      setMode('join');
    }
  };

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
        title: 'Error',
        description: 'Failed to create pairing. Please try again.',
        variant: 'destructive',
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
        title: 'Copied!',
        description: 'Share this with your beloved to complete pairing.',
      });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleJoinPairing = async () => {
    if (!partnerId || !partnerPassphrase) {
      toast({
        title: 'Missing information',
        description: 'Please enter both partner ID and passphrase.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      await completePairing(partnerId, partnerPassphrase);
      toast({
        title: 'Paired!',
        description: 'Welcome to your private sanctuary.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to complete pairing. Please check your details.',
        variant: 'destructive',
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
                Have them scan this QR code with their phone camera
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
              Once your beloved scans this or enters the details, your private space will be ready.
            </p>
          </Card>
        )}

        {mode === 'scan' && (
          <Card className="p-8 space-y-6 border-sage/30">
            <div className="text-center space-y-2">
              <Camera className="w-8 h-8 mx-auto text-accent animate-pulse-glow" />
              <h2 className="text-xl font-light">Scan QR Code</h2>
              <p className="text-sm text-muted-foreground">
                Point your camera at the QR code
              </p>
            </div>

            <div id="qr-reader" className="w-full rounded-lg overflow-hidden bg-muted"></div>

            <Button
              onClick={() => {
                if (scannerRef.current) {
                  try {
                    scannerRef.current.clear();
                  } catch (e) {
                    console.log('Scanner cleanup:', e);
                  }
                }
                setScannerInitialized(false);
                setMode('join');
              }}
              variant="ghost"
              className="w-full"
              data-testid="button-cancel-scan"
            >
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
          </Card>
        )}

        {mode === 'join' && (
          <Card className="p-8 space-y-6 border-sage/30">
            <div className="text-center space-y-2">
              <Heart className="w-8 h-8 mx-auto text-accent" />
              <h2 className="text-xl font-light">Join Your Beloved</h2>
              <p className="text-sm text-muted-foreground">
                Scan their QR code or enter details manually
              </p>
            </div>

            <div className="space-y-4">
              <Button
                onClick={() => setMode('scan')}
                variant="outline"
                className="w-full h-12 text-base"
                data-testid="button-open-camera"
              >
                <Camera className="w-5 h-5 mr-2" />
                Scan QR Code with Camera
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-muted"></div>
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">Or enter manually</span>
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="qr-code" className="text-sm font-medium">
                  Paste QR Data
                </label>
                <Input
                  id="qr-code"
                  placeholder="dodi:userId:passphrase"
                  value={qrCodeData}
                  onChange={(e) => handleQrCodePaste(e.target.value)}
                  className="font-mono"
                  data-testid="input-qr-code"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="partner-id" className="text-sm font-medium">
                  Partner ID
                </label>
                <Input
                  id="partner-id"
                  placeholder="Their user ID"
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
