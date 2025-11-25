import { useState, useEffect, useRef } from 'react';
import { useDodi } from '@/contexts/DodiContext';
import { usePeerConnection } from '@/hooks/use-peer-connection';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { QRCodeSVG } from 'qrcode.react';
import { Heart, Lock, Copy, Check, Sparkles, Camera, X, Loader2, QrCode } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ThemeToggle } from '@/components/theme-toggle';
import dodiTypographyLogo from '@assets/generated_images/hebrew_dodi_typography_logo.png';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { 
  encodePairingPayload, 
  decodePairingPayload,
  savePendingSession,
  getPendingSession,
  clearPendingSession,
  saveJoinerResponse,
  getJoinerResponse,
  clearJoinerResponse,
  type PairingPayload,
} from '@/lib/pairing-codes';
import { nanoid } from 'nanoid';

type Mode = 
  | 'choose' 
  | 'creating' 
  | 'creator-show-qr'      // Creator showing QR with offer
  | 'creator-scan-answer'  // Creator scanning joiner's answer QR
  | 'joiner-scanning'      // Joiner scanning creator's QR
  | 'joiner-show-answer';  // Joiner showing answer QR

export default function PairingPage() {
  const { initializePairing, completePairing, onPeerConnected, pairingStatus, userId, setPartnerIdForCreator } = useDodi();
  const { createOffer, acceptOffer, completeConnection, state: peerState } = usePeerConnection();
  const { toast } = useToast();
  
  const [mode, setMode] = useState<Mode>('choose');
  const [pairingPayload, setPairingPayload] = useState<PairingPayload | null>(null);
  const [answerQrData, setAnswerQrData] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const [scannerInitialized, setScannerInitialized] = useState(false);

  // Check if we have a pending session or joiner response on mount
  useEffect(() => {
    const pendingSession = getPendingSession();
    const storedJoinerResponse = getJoinerResponse();
    
    if (pairingStatus === 'connected') {
      return; // Already connected, no need to restore
    }
    
    if (pendingSession) {
      // Creator: restore pending session
      setPairingPayload({
        creatorId: pendingSession.creatorId,
        passphrase: pendingSession.passphrase,
        offer: pendingSession.offer,
        sessionId: pendingSession.sessionId,
        createdAt: pendingSession.createdAt,
      });
      setMode('creator-show-qr');
    } else if (storedJoinerResponse) {
      // Joiner: restore answer QR display
      const answerPayload = {
        answer: storedJoinerResponse.answer,
        joinerId: storedJoinerResponse.joinerId,
        sessionId: storedJoinerResponse.sessionId,
      };
      const answerData = `dodi-answer:${btoa(JSON.stringify(answerPayload))}`;
      setAnswerQrData(answerData);
      setMode('joiner-show-answer');
    }
  }, [pairingStatus]);


  // Watch for P2P connection to complete
  useEffect(() => {
    if (peerState.connected) {
      clearPendingSession();
      clearJoinerResponse();
      onPeerConnected();
      toast({
        title: 'Connected!',
        description: 'Your private sanctuary awaits.',
      });
    }
  }, [peerState.connected, onPeerConnected, toast]);

  // Creator: Generate offer and pairing payload
  const handleCreatePairing = async () => {
    setLoading(true);
    try {
      // Initialize user and get credentials
      const data = await initializePairing();
      
      // Generate WebRTC offer
      const offer = await createOffer();
      const sessionId = nanoid(8);
      
      const payload: PairingPayload = {
        creatorId: data.userId,
        passphrase: data.passphrase,
        offer: offer,
        sessionId: sessionId,
        createdAt: Date.now(),
      };
      
      // Save pending session for page refresh
      savePendingSession({
        sessionId,
        creatorId: data.userId,
        passphrase: data.passphrase,
        offer,
        createdAt: Date.now(),
      });
      
      setPairingPayload(payload);
      setMode('creator-show-qr');
      
    } catch (error) {
      console.error('Create pairing error:', error);
      toast({
        title: 'Error',
        description: 'Failed to create connection. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Creator: Handle scanning joiner's answer QR
  const handleCreatorScanAnswer = async (data: string) => {
    cleanupScanner();
    setLoading(true);
    
    try {
      console.log('Creator scanned answer QR data:', data?.substring(0, 50));
      
      // Parse the answer QR data
      const cleanData = data.replace('dodi-answer:', '');
      const parsed = JSON.parse(atob(cleanData));
      const { answer, joinerId } = parsed;
      
      if (!joinerId) {
        throw new Error('Invalid response: missing partner ID');
      }
      
      console.log('Parsed answer payload, joinerId:', joinerId);
      
      // Store the partner's ID
      console.log('Setting partner ID for creator:', joinerId);
      await setPartnerIdForCreator(joinerId);
      console.log('Partner ID set successfully');
      
      // Complete the WebRTC connection
      console.log('Completing WebRTC connection with answer');
      completeConnection(answer);
      
      toast({
        title: 'Connected!',
        description: 'Your partner is connecting...',
      });
      
    } catch (error) {
      console.error('Parse answer error:', error);
      console.error('Error details:', error instanceof Error ? error.message : 'Unknown error');
      toast({
        title: 'Invalid QR Code',
        description: error instanceof Error ? error.message : 'Please scan the QR code your partner is showing.',
        variant: 'destructive',
      });
      setMode('creator-show-qr');
    } finally {
      setLoading(false);
    }
  };

  // Joiner: Process scanned QR and generate answer
  const handleJoinerScanCreator = async (data: string) => {
    cleanupScanner();
    setLoading(true);
    
    try {
      console.log('Joiner scanned QR data:', data?.substring(0, 50));
      
      // Decode the QR payload
      const cleanData = data.replace('dodi:', '').replace('dodi-answer:', '');
      const payload = decodePairingPayload(cleanData);
      
      if (!payload) {
        throw new Error('Invalid QR code format - could not decode payload');
      }
      
      console.log('Decoded payload:', { creatorId: payload.creatorId, sessionId: payload.sessionId });
      
      // Complete pairing with credentials - this returns the joiner's userId
      console.log('Completing pairing with creator:', payload.creatorId);
      const joinerId = await completePairing(payload.creatorId, payload.passphrase);
      console.log('Pairing completed, joinerId:', joinerId);
      
      // Generate WebRTC answer
      console.log('Accepting offer...');
      const answer = await acceptOffer(payload.offer);
      console.log('Answer generated');
      
      // Create answer QR data with the confirmed joiner ID
      const answerPayload = {
        answer,
        joinerId,
        sessionId: payload.sessionId,
      };
      
      const answerData = `dodi-answer:${btoa(JSON.stringify(answerPayload))}`;
      
      // Save joiner response for page refresh
      saveJoinerResponse({
        joinerId,
        answer,
        shortCode: '', // Not used in QR flow
        sessionId: payload.sessionId,
      });
      
      console.log('Transitioning to joiner-show-answer');
      setAnswerQrData(answerData);
      setMode('joiner-show-answer');
      
      toast({
        title: 'QR scanned!',
        description: 'Now show your QR code to your partner.',
      });
      
    } catch (error) {
      console.error('Scan process error:', error);
      console.error('Error details:', error instanceof Error ? error.message : 'Unknown error');
      toast({
        title: 'Error processing QR',
        description: error instanceof Error ? error.message : 'Failed to process QR code. Please try again.',
        variant: 'destructive',
      });
      setMode('choose');
    } finally {
      setLoading(false);
    }
  };

  // Scanner cleanup helper
  const cleanupScanner = () => {
    if (scannerRef.current) {
      try {
        scannerRef.current.clear();
        scannerRef.current = null;
      } catch (e) {
        console.log('Scanner cleanup:', e);
      }
    }
    setScannerInitialized(false);
  };

  // Initialize QR scanner
  useEffect(() => {
    const shouldScan = mode === 'joiner-scanning' || mode === 'creator-scan-answer';
    
    if (shouldScan && !scannerInitialized) {
      const timeoutId = setTimeout(() => {
        const element = document.getElementById('qr-reader');
        if (element) {
          initializeScanner(mode === 'creator-scan-answer');
        }
      }, 100);
      
      return () => clearTimeout(timeoutId);
    }

    return () => {
      cleanupScanner();
    };
  }, [mode, scannerInitialized]);

  const initializeScanner = async (isCreatorScanning: boolean) => {
    try {
      const element = document.getElementById('qr-reader');
      if (!element) throw new Error('QR reader element not found');
      
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

      const successHandler = isCreatorScanning ? handleCreatorScanAnswer : handleJoinerScanCreator;

      await scanner.render(successHandler, (error: unknown) => {
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

  const handleCopyQrData = () => {
    const dataToCopy = mode === 'joiner-show-answer' ? answerQrData : (pairingPayload ? `dodi:${encodePairingPayload(pairingPayload)}` : '');
    navigator.clipboard.writeText(dataToCopy);
    setCopied(true);
    toast({
      title: 'Copied!',
      description: 'QR data copied to clipboard.',
    });
    setTimeout(() => setCopied(false), 2000);
  };

  // Generate QR data for creator
  const creatorQrData = pairingPayload ? `dodi:${encodePairingPayload(pairingPayload)}` : '';

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
            <span>End-to-end encrypted</span>
          </div>
        </div>

        {mode === 'choose' && (
          <Card className="p-8 space-y-6 border-sage/30">
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
                className="w-full h-12 text-base"
                data-testid="button-create-pairing"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Heart className="w-5 h-5 mr-2" />
                    Create Connection
                  </>
                )}
              </Button>

              <Button
                onClick={() => setMode('joiner-scanning')}
                variant="outline"
                className="w-full h-12 text-base"
                data-testid="button-scan-qr"
              >
                <Camera className="w-5 h-5 mr-2" />
                Join with QR Code
              </Button>
            </div>
          </Card>
        )}

        {mode === 'creator-show-qr' && pairingPayload && (
          <Card className="p-8 space-y-6 border-sage/30">
            <div className="text-center space-y-2">
              <Heart className="w-8 h-8 mx-auto text-accent animate-gentle-bounce" />
              <h2 className="text-xl font-light">Show This to Your Partner</h2>
              <p className="text-sm text-muted-foreground">
                They'll scan this code to join
              </p>
            </div>

            <div className="flex justify-center p-6 bg-white rounded-lg">
              <QRCodeSVG
                value={creatorQrData}
                size={200}
                level="L"
                includeMargin
                data-testid="qr-code-creator"
              />
            </div>

            <Button
              onClick={handleCopyQrData}
              variant="outline"
              className="w-full"
              data-testid="button-copy-qr"
            >
              {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
              {copied ? 'Copied!' : 'Copy QR Data'}
            </Button>

            <div className="p-4 bg-muted/50 rounded-lg text-center">
              <Loader2 className="w-6 h-6 mx-auto animate-spin text-accent mb-2" />
              <p className="text-sm text-muted-foreground">
                After your partner scans, you'll automatically scan their response...
              </p>
            </div>

            <Button
              onClick={() => {
                clearPendingSession();
                setPairingPayload(null);
                setMode('choose');
              }}
              variant="ghost"
              className="w-full"
              data-testid="button-cancel-create"
            >
              Cancel
            </Button>
          </Card>
        )}

        {(mode === 'joiner-scanning' || mode === 'creator-scan-answer') && (
          <Card className="p-0 space-y-0 border-sage/30 overflow-hidden">
            <div className="p-8 space-y-4 text-center bg-gradient-to-b from-accent/5 to-transparent">
              <div className="animate-pulse-glow">
                <Camera className="w-8 h-8 mx-auto text-accent" />
              </div>
              <div className="space-y-1">
                <h2 className="text-xl font-light">
                  {mode === 'creator-scan-answer' ? 'Scan Their Response' : 'Scan Your Partner\'s QR'}
                </h2>
                <p className="text-sm text-muted-foreground">
                  Point your camera at the code
                </p>
              </div>
            </div>

            <div id="qr-reader" className="w-full h-80 bg-muted"></div>

            <div className="p-8 space-y-3">
              <p className="text-xs text-muted-foreground text-center">
                {loading ? 'Processing...' : 'Camera is ready'}
              </p>
              <Button
                onClick={() => {
                  cleanupScanner();
                  setMode(mode === 'creator-scan-answer' ? 'creator-show-qr' : 'choose');
                }}
                variant="ghost"
                className="w-full"
                data-testid="button-cancel-scan"
              >
                <X className="w-4 h-4 mr-2" />
                Back
              </Button>
            </div>
          </Card>
        )}

        {mode === 'joiner-show-answer' && answerQrData && (
          <Card className="p-8 space-y-6 border-sage/30">
            <div className="text-center space-y-2">
              <Heart className="w-8 h-8 mx-auto text-accent animate-gentle-bounce" />
              <h2 className="text-xl font-light">Now Show This to Your Partner</h2>
              <p className="text-sm text-muted-foreground">
                They'll scan this to complete your connection
              </p>
            </div>

            <div className="flex justify-center p-6 bg-white rounded-lg">
              <QRCodeSVG
                value={answerQrData}
                size={200}
                level="L"
                includeMargin
                data-testid="qr-code-answer"
              />
            </div>

            <Button
              onClick={handleCopyQrData}
              variant="outline"
              className="w-full"
              data-testid="button-copy-answer"
            >
              {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
              {copied ? 'Copied!' : 'Copy QR Data'}
            </Button>

            {peerState.connecting && (
              <div className="p-4 bg-muted/50 rounded-lg text-center">
                <Loader2 className="w-6 h-6 mx-auto animate-spin text-accent mb-2" />
                <p className="text-sm text-muted-foreground">
                  Waiting for partner to scan...
                </p>
              </div>
            )}

            {peerState.connected && (
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg text-center">
                <p className="text-green-700 dark:text-green-400 font-medium">
                  Connected! Entering your sanctuary...
                </p>
              </div>
            )}

            <Button
              onClick={() => {
                setAnswerQrData('');
                setMode('choose');
              }}
              variant="ghost"
              className="w-full"
              data-testid="button-cancel-join"
            >
              Start Over
            </Button>
          </Card>
        )}

        {loading && mode === 'choose' && (
          <div className="fixed inset-0 bg-background/80 flex items-center justify-center z-50">
            <div className="text-center space-y-4">
              <Loader2 className="w-12 h-12 mx-auto animate-spin text-accent" />
              <p className="text-muted-foreground">Setting up your connection...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
