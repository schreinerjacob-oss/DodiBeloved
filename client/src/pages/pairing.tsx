import { useState, useEffect, useRef } from 'react';
import { useDodi } from '@/contexts/DodiContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { QRCodeSVG } from 'qrcode.react';
import { Heart, Lock, Copy, Check, Sparkles, Camera, X, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ThemeToggle } from '@/components/theme-toggle';
import dodiTypographyLogo from '@assets/generated_images/hebrew_dodi_typography_logo.png';
import { Html5QrcodeScanner } from 'html5-qrcode';

export default function PairingPage() {
  const { initializePairing, completePairing, onPeerConnected, pairingStatus, userId, passphrase, setPartnerIdForCreator } = useDodi();
  const { toast } = useToast();
  const [mode, setMode] = useState<'choose' | 'create' | 'join' | 'scan' | 'creator-enter-partner'>('choose');
  const [pairingData, setPairingData] = useState<{ userId: string; passphrase: string } | null>(null);
  const [partnerPassphrase, setPartnerPassphrase] = useState('');
  const [partnerId, setPartnerId] = useState('');
  const [qrCodeData, setQrCodeData] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const [scannerInitialized, setScannerInitialized] = useState(false);

  // If we're already in 'waiting' status (page refresh), restore the create mode
  useEffect(() => {
    if (pairingStatus === 'waiting' && userId && passphrase) {
      setPairingData({ userId, passphrase });
      setMode('create');
    }
  }, [pairingStatus, userId, passphrase]);

  // Handle creator moving to enter partner's ID step
  const handleCreatorSharedCredentials = () => {
    setMode('creator-enter-partner');
  };

  // Handle creator completing pairing with partner's ID
  const handleCreatorCompletePairing = async () => {
    if (!partnerId) {
      toast({
        title: 'Missing Partner ID',
        description: 'Please enter your partner\'s ID to complete pairing.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      await setPartnerIdForCreator(partnerId);
      onPeerConnected();
      toast({
        title: 'Pairing Complete!',
        description: 'Your private sanctuary awaits.',
      });
    } catch (error) {
      console.error('Error completing pairing:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to complete pairing. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (mode === 'scan' && !scannerInitialized) {
      const timeoutId = setTimeout(() => {
        const element = document.getElementById('qr-reader');
        if (element) {
          initializeScanner();
        } else {
          console.error('QR reader element not found');
        }
      }, 100);
      
      return () => clearTimeout(timeoutId);
    }

    return () => {
      if (scannerRef.current) {
        try {
          scannerRef.current.clear();
          scannerRef.current = null;
        } catch (e) {
          console.log('Scanner cleanup:', e);
        }
      }
    };
  }, [mode, scannerInitialized]);

  const initializeScanner = async () => {
    try {
      console.log('Initializing QR scanner...');
      const element = document.getElementById('qr-reader');
      if (!element) {
        throw new Error('QR reader element not found in DOM');
      }
      
      element.innerHTML = '';
      
      const scanner = new Html5QrcodeScanner(
        'qr-reader',
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
          rememberLastUsedCamera: true,
          disableFlip: false,
          showTorchButtonIfSupported: true,
        },
        false
      );

      scannerRef.current = scanner;
      setScannerInitialized(true);

      await scanner.render(handleScanSuccess, (error: any) => {
        console.log('Scanner error:', error);
      });
    } catch (error) {
      console.error('Failed to initialize scanner:', error);
      toast({
        title: 'Camera Error',
        description: 'Unable to access camera. Please check permissions.',
        variant: 'destructive',
      });
      setScannerInitialized(false);
    }
  };

  const handleScanSuccess = (data: string) => {
    const parts = data.replace('dodi:', '').split(':');
    if (parts.length >= 2) {
      if (scannerRef.current) {
        try {
          scannerRef.current.clear();
          scannerRef.current = null;
        } catch (e) {
          console.log('Scanner clear error:', e);
        }
      }
      setScannerInitialized(false);
      
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
      if (parts.length >= 2) {
        setPartnerId(parts[0]);
        setPartnerPassphrase(parts[1]);
      }
    }
  };

  const handleCreatePairing = async () => {
    setLoading(true);
    try {
      console.log('Creator: Initializing pairing...');
      const data = await initializePairing();
      setPairingData(data);
      console.log('Creator: Pairing initialized, userId:', data.userId);
      setMode('create');
    } catch (error) {
      console.error('Create pairing error:', error);
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
      const copyData = `${pairingData.userId}:${pairingData.passphrase}`;
      navigator.clipboard.writeText(copyData);
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
      console.log('Joiner: Starting pairing...');
      await completePairing(partnerId, partnerPassphrase);
      console.log('Pairing completed successfully');
      toast({
        title: 'Paired!',
        description: 'Welcome to your private sanctuary.',
      });
    } catch (error) {
      console.error('Pairing error:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to complete pairing. Please check your details.',
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
                Have them scan this QR code or enter the details below
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

            <Button
              onClick={handleCreatorSharedCredentials}
              className="w-full h-12 text-base"
              data-testid="button-shared-credentials"
            >
              <Heart className="w-5 h-5 mr-2" />
              I've Shared This - Continue
            </Button>

            <p className="text-xs text-center text-muted-foreground leading-relaxed">
              Share the QR code or credentials above with your beloved, then click Continue.
            </p>
          </Card>
        )}

        {mode === 'creator-enter-partner' && pairingData && (
          <Card className="p-8 space-y-6 border-sage/30">
            <div className="text-center space-y-2">
              <Heart className="w-8 h-8 mx-auto text-accent animate-gentle-bounce" />
              <h2 className="text-xl font-light">Almost There!</h2>
              <p className="text-sm text-muted-foreground">
                Once your beloved has joined, enter their ID below to complete pairing
              </p>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                <p className="text-xs text-muted-foreground font-medium">YOUR CREDENTIALS (SHARED)</p>
                <p className="text-sm font-mono break-all">{pairingData.userId}</p>
                <p className="text-sm font-mono">{pairingData.passphrase}</p>
              </div>

              <div className="space-y-2">
                <label htmlFor="creator-partner-id" className="text-sm font-medium">
                  Partner's ID
                </label>
                <Input
                  id="creator-partner-id"
                  placeholder="Enter your beloved's ID"
                  value={partnerId}
                  onChange={(e) => setPartnerId(e.target.value)}
                  className="font-mono"
                  data-testid="input-creator-partner-id"
                />
                <p className="text-xs text-muted-foreground">
                  Ask your beloved to share their ID from their Settings page after they join
                </p>
              </div>

              <Button
                onClick={handleCreatorCompletePairing}
                disabled={loading || !partnerId}
                className="w-full h-12 text-base"
                data-testid="button-creator-complete"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Completing...
                  </>
                ) : (
                  'Complete Pairing'
                )}
              </Button>

              <Button
                onClick={() => setMode('create')}
                variant="ghost"
                className="w-full"
                data-testid="button-back-to-share"
              >
                Back to Share Credentials
              </Button>
            </div>
          </Card>
        )}

        {mode === 'scan' && (
          <Card className="p-0 space-y-0 border-sage/30 overflow-hidden">
            <div className="p-8 space-y-2 text-center">
              <Camera className="w-8 h-8 mx-auto text-accent animate-pulse-glow" />
              <h2 className="text-xl font-light">Scan QR Code</h2>
              <p className="text-sm text-muted-foreground">
                Point your camera at the QR code
              </p>
            </div>

            <div id="qr-reader" className="w-full h-80 bg-muted"></div>

            <div className="p-8">
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
            </div>
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
                  placeholder="Partner's ID"
                  value={partnerId}
                  onChange={(e) => setPartnerId(e.target.value)}
                  className="font-mono"
                  data-testid="input-partner-id"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="passphrase" className="text-sm font-medium">
                  Passphrase
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
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  'Complete Pairing'
                )}
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
