import { useState, useEffect, useRef } from 'react';
import { useDodi } from '@/contexts/DodiContext';
import { usePeerConnection } from '@/hooks/use-peer-connection';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { QRCodeSVG } from 'qrcode.react';
import { Heart, Sparkles, Camera, Loader2, Shield, Infinity as InfinityIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ThemeToggle } from '@/components/theme-toggle';
import dodiTypographyLogo from '@assets/generated_images/hebrew_dodi_typography_logo.png';
import { Html5Qrcode } from 'html5-qrcode';
import { 
  encodeTunnelOffer, 
  decodeTunnelOffer,
  type MasterKeyPayload,
} from '@/lib/tunnel-handshake';
import { nanoid } from 'nanoid';
import { motion, AnimatePresence } from 'framer-motion';

type Mode = 
  | 'choose' 
  | 'creating' 
  | 'creator-show-qr'
  | 'joiner-scanning'
  | 'joiner-connecting'
  | 'success-animation';

export default function PairingPage() {
  const { 
    completePairingWithMasterKey, 
    onPeerConnected, 
    pairingStatus 
  } = useDodi();
  const { 
    createOffer, 
    acceptOffer, 
    completeConnection, 
    state: peerState,
    setOnTunnelComplete,
  } = usePeerConnection();
  const { toast } = useToast();
  
  const [mode, setMode] = useState<Mode>('choose');
  const [qrData, setQrData] = useState<string>('');
  const [fingerprint, setFingerprint] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const [scannerInitialized, setScannerInitialized] = useState(false);
  const creatorDataRef = useRef<{ offer: string; publicKey: string; fingerprint: string } | null>(null);

  useEffect(() => {
    if (pairingStatus === 'connected') {
      setMode('success-animation');
      setShowSuccess(true);
    }
  }, [pairingStatus]);

  const handleMasterKeyReceived = async (payload: MasterKeyPayload) => {
    console.log('Master key received via tunnel');
    try {
      await completePairingWithMasterKey(payload.masterKey, payload.salt, payload.creatorId);
      onPeerConnected();
      setMode('success-animation');
      setShowSuccess(true);
    } catch (error) {
      console.error('Failed to complete pairing with master key:', error);
      toast({
        title: 'Pairing Failed',
        description: 'Could not complete secure connection. Please try again.',
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    setOnTunnelComplete(handleMasterKeyReceived);
  }, [setOnTunnelComplete]);

  useEffect(() => {
    if (peerState.tunnelEstablished && mode !== 'success-animation') {
      setMode('success-animation');
      setShowSuccess(true);
    }
  }, [peerState.tunnelEstablished, mode]);

  const handleCreatePairing = async () => {
    setLoading(true);
    setMode('creating');
    
    try {
      const offer = await createOffer();
      
      const { generateEphemeralKeyPair, createTunnelOffer, encodeTunnelOffer: encode } = await import('@/lib/tunnel-handshake');
      const ephemeralKeyPair = await generateEphemeralKeyPair();
      
      const tunnelOffer = createTunnelOffer(offer, ephemeralKeyPair);
      const encoded = encode(tunnelOffer);
      
      creatorDataRef.current = {
        offer,
        publicKey: ephemeralKeyPair.publicKey,
        fingerprint: ephemeralKeyPair.fingerprint,
      };
      
      setQrData(`dodi:${encoded}`);
      setFingerprint(ephemeralKeyPair.fingerprint);
      setMode('creator-show-qr');
      
    } catch (error) {
      console.error('Create pairing error:', error);
      toast({
        title: 'Error',
        description: 'Failed to create connection. Please try again.',
        variant: 'destructive',
      });
      setMode('choose');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinerScan = async (data: string) => {
    if (loading || !data.startsWith('dodi:')) return;

    setLoading(true);
    await stopScanner();
    setMode('joiner-connecting');

    try {
      const encoded = data.replace('dodi:', '');
      const tunnelOffer = decodeTunnelOffer(encoded);
      
      if (!tunnelOffer) {
        throw new Error('Invalid QR code');
      }

      console.log('Scanned tunnel offer, fingerprint:', tunnelOffer.fingerprint);

      const { answer, publicKey, fingerprint: myFingerprint } = await acceptOffer(
        tunnelOffer.offer,
        tunnelOffer.publicKey,
        tunnelOffer.fingerprint
      );
      
      setFingerprint(myFingerprint);
      
      toast({
        title: 'Connecting...',
        description: 'Establishing secure tunnel with partner.',
      });
      
    } catch (error) {
      console.error('Scan process error:', error);
      toast({
        title: 'Error',
        description: 'Failed to process QR code. Try again.',
        variant: 'destructive',
      });
      setMode('choose');
      setLoading(false);
    }
  };

  const stopScanner = async () => {
    if (html5QrCodeRef.current) {
      try {
        if (html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop();
        }
        html5QrCodeRef.current.clear();
      } catch (e) {
        console.error('Error stopping scanner:', e);
      }
      html5QrCodeRef.current = null;
    }
    setScannerInitialized(false);
  };

  const startScanner = async () => {
    try {
      const devices = await Html5Qrcode.getCameras();

      if (devices && devices.length) {
        const html5QrCode = new Html5Qrcode("qr-reader");
        html5QrCodeRef.current = html5QrCode;
        
        await html5QrCode.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 280, height: 280 },
            aspectRatio: 1.0
          },
          handleJoinerScan,
          () => {}
        );
        setScannerInitialized(true);
      } else {
        toast({ 
          title: "No Camera", 
          description: "No camera found on this device.", 
          variant: "destructive" 
        });
      }
    } catch (err) {
      console.error("Error starting scanner:", err);
      toast({ 
        title: "Camera Error", 
        description: "Could not start camera. Check permissions.", 
        variant: "destructive" 
      });
    }
  };

  useEffect(() => {
    if (mode === 'joiner-scanning' && !scannerInitialized) {
      const timer = setTimeout(() => startScanner(), 100);
      return () => clearTimeout(timer);
    }
    
    if (mode !== 'joiner-scanning' && scannerInitialized) {
      stopScanner();
    }

    return () => {
      if (scannerInitialized) {
        stopScanner();
      }
    };
  }, [mode, scannerInitialized]);

  if (showSuccess || mode === 'success-animation') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-cream via-sage/10 to-blush/20 dark:from-background dark:via-card dark:to-secondary flex items-center justify-center p-6">
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="text-center space-y-8"
        >
          <motion.div
            animate={{ 
              scale: [1, 1.1, 1],
              rotate: [0, 5, -5, 0],
            }}
            transition={{ 
              duration: 2,
              repeat: Infinity,
              repeatType: "reverse"
            }}
            className="relative inline-block"
          >
            <div className="absolute inset-0 bg-gold/30 rounded-full blur-3xl animate-pulse" />
            <div className="relative bg-gradient-to-br from-sage to-blush p-8 rounded-full">
              <InfinityIcon className="w-20 h-20 text-white" />
            </div>
          </motion.div>
          
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="space-y-3"
          >
            <h1 className="text-3xl font-light text-foreground">
              Your Gardens Are Now
            </h1>
            <p className="text-4xl font-serif text-sage dark:text-sage">
              Eternally Connected
            </p>
            <div className="flex justify-center gap-2 pt-4">
              <Sparkles className="w-5 h-5 text-gold animate-pulse" />
              <Heart className="w-5 h-5 text-blush animate-pulse" style={{ animationDelay: '0.2s' }} />
              <Sparkles className="w-5 h-5 text-gold animate-pulse" style={{ animationDelay: '0.4s' }} />
            </div>
          </motion.div>
          
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.5 }}
            className="pt-4"
          >
            <Card className="p-4 bg-sage/10 border-sage/30 inline-block">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Shield className="w-4 h-4 text-sage" />
                <span>End-to-end encrypted</span>
              </div>
            </Card>
          </motion.div>
          
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.9, duration: 0.5 }}
          >
            <p className="text-sm text-muted-foreground">
              Redirecting to your sanctuary...
            </p>
          </motion.div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-cream via-sage/10 to-blush/20 dark:from-background dark:via-card dark:to-secondary flex items-center justify-center p-6">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md space-y-8 animate-fade-in">
        <div className="text-center space-y-3">
          <div className="inline-block mb-2">
            <img src={dodiTypographyLogo} alt="dodi" className="h-20" data-testid="img-logo" />
          </div>
          <h1 className="text-4xl font-light tracking-wide text-foreground">dodi</h1>
          <p className="text-muted-foreground font-light">my beloved</p>
        </div>

        <AnimatePresence mode="wait">
          {mode === 'choose' && (
            <motion.div
              key="choose"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <Card className="p-8 space-y-6 border-sage/30 shadow-lg">
                <div className="space-y-3 text-center">
                  <Sparkles className="w-8 h-8 mx-auto text-gold animate-pulse-glow" />
                  <h2 className="text-2xl font-light">Create Your Sacred Space</h2>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    A completely private sanctuary that belongs only to you and your beloved.
                  </p>
                </div>
                <div className="space-y-3">
                  <Button 
                    onClick={handleCreatePairing} 
                    disabled={loading} 
                    className="w-full h-12 text-base hover-elevate"
                    data-testid="button-create-connection"
                  >
                    {loading ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Heart className="w-5 h-5 mr-2" />
                    )}
                    {loading ? 'Creating...' : 'Create Connection'}
                  </Button>
                  <Button 
                    onClick={() => setMode('joiner-scanning')} 
                    variant="outline" 
                    className="w-full h-12 text-base hover-elevate"
                    data-testid="button-join-qr"
                  >
                    <Camera className="w-5 h-5 mr-2" />
                    Join with QR Code
                  </Button>
                </div>
              </Card>
            </motion.div>
          )}

          {mode === 'creating' && (
            <motion.div
              key="creating"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <Card className="p-8 space-y-6 border-sage/30 shadow-lg">
                <div className="text-center space-y-4">
                  <Loader2 className="w-12 h-12 mx-auto animate-spin text-sage" />
                  <h2 className="text-xl font-light">Creating Secure Tunnel...</h2>
                  <p className="text-sm text-muted-foreground">
                    Generating encryption keys
                  </p>
                </div>
              </Card>
            </motion.div>
          )}

          {mode === 'creator-show-qr' && qrData && (
            <motion.div
              key="creator-qr"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <Card className="p-8 space-y-6 border-sage/30 shadow-lg">
                <div className="text-center space-y-2">
                  <h2 className="text-xl font-light">Show This to Your Partner</h2>
                  <p className="text-sm text-muted-foreground">
                    They scan this to join your sanctuary
                  </p>
                </div>
                
                <div className="relative flex justify-center">
                  <div className="absolute inset-0 bg-gradient-to-br from-sage/20 to-blush/20 rounded-lg blur-xl" />
                  <div className="relative p-4 bg-white rounded-lg shadow-lg">
                    <QRCodeSVG
                      value={qrData}
                      size={220}
                      level="L"
                      includeMargin={true}
                    />
                  </div>
                </div>
                
                {fingerprint && (
                  <div className="p-3 bg-sage/10 rounded-md text-center">
                    <p className="text-xs text-muted-foreground mb-1">Security Fingerprint</p>
                    <p className="font-mono text-sm text-sage">{fingerprint}</p>
                  </div>
                )}
                
                <div className="flex items-center gap-2 justify-center text-xs text-muted-foreground">
                  <Shield className="w-3 h-3" />
                  <span>Ultra-light encrypted tunnel</span>
                </div>

                {peerState.connecting && (
                  <div className="p-4 bg-gold/10 rounded-lg text-center animate-pulse">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-gold" />
                      <span className="text-sm text-gold">Partner connecting...</span>
                    </div>
                  </div>
                )}

                <Button 
                  onClick={() => { 
                    setQrData(''); 
                    setFingerprint('');
                    setMode('choose'); 
                  }} 
                  variant="ghost" 
                  className="w-full"
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
              </Card>
            </motion.div>
          )}

          {mode === 'joiner-scanning' && (
            <motion.div
              key="joiner-scanning"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <Card className="p-0 space-y-0 border-sage/30 overflow-hidden shadow-lg bg-black">
                <div className="relative h-[400px] w-full">
                  <div id="qr-reader" className="w-full h-full" />
                  
                  <div className="absolute inset-0 border-[50px] border-black/50 pointer-events-none flex items-center justify-center">
                    <div className="w-64 h-64 border-2 border-white/50 rounded-lg flex items-center justify-center relative">
                      <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-sage" />
                      <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-sage" />
                      <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-sage" />
                      <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-sage" />
                    </div>
                  </div>

                  <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
                    <p className="text-sm font-medium text-white text-center mb-3">
                      Scan partner's QR code
                    </p>
                    <Button 
                      onClick={() => { 
                        stopScanner(); 
                        setMode('choose'); 
                      }} 
                      variant="secondary" 
                      size="sm"
                      className="w-full bg-white/20 hover:bg-white/30 border-none text-white"
                      data-testid="button-cancel-scan"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </Card>
            </motion.div>
          )}

          {mode === 'joiner-connecting' && (
            <motion.div
              key="joiner-connecting"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <Card className="p-8 space-y-6 border-sage/30 shadow-lg">
                <div className="text-center space-y-4">
                  <div className="relative inline-block">
                    <div className="absolute inset-0 bg-sage/30 rounded-full blur-xl animate-pulse" />
                    <div className="relative bg-sage/20 p-6 rounded-full">
                      <Shield className="w-12 h-12 text-sage" />
                    </div>
                  </div>
                  <h2 className="text-xl font-light">Establishing Secure Tunnel</h2>
                  <p className="text-sm text-muted-foreground">
                    Exchanging encryption keys...
                  </p>
                  
                  {fingerprint && (
                    <div className="p-3 bg-sage/10 rounded-md">
                      <p className="text-xs text-muted-foreground mb-1">Your Fingerprint</p>
                      <p className="font-mono text-sm text-sage">{fingerprint}</p>
                    </div>
                  )}
                  
                  <div className="flex justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-sage" />
                  </div>
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
