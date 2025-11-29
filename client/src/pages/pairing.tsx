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
  encodeJoinerResponse,
  decodeJoinerResponse,
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
  const [requestingPermission, setRequestingPermission] = useState(false);
  
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
      // We reconstruct the compressed payload from stored data
      const fullAnswerString = `dodi-answer:${encodeJoinerResponse(storedJoinerResponse)}`;
      setAnswerQrData(fullAnswerString);
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
      const data = await initializePairing();
      const offer = await createOffer();
      const sessionId = nanoid(8);
      
      const payload: PairingPayload = {
        creatorId: data.userId,
        passphrase: data.passphrase,
        offer: offer,
        sessionId: sessionId,
        createdAt: Date.now(),
      };
      
      savePendingSession(payload);
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
      console.log('Creator scanned raw data:', data?.substring(0, 20) + '...');
      
      // 1. Strip prefix
      const cleanData = data.replace('dodi-answer:', '');
      
      // 2. Decode using our new robust decoder (handles compression & minification)
      const parsed = decodeJoinerResponse(cleanData);
      
      if (!parsed || !parsed.joinerId) {
        throw new Error('Invalid response: could not decode partner data');
      }
      
      console.log('Parsed answer payload, joinerId:', parsed.joinerId);
      
      await setPartnerIdForCreator(parsed.joinerId);
      completeConnection(parsed.answer);
      
      toast({
        title: 'Connecting...',
        description: 'Verifying secure link with partner.',
      });
      
    } catch (error) {
      console.error('Parse answer error:', error);
      toast({
        title: 'Invalid QR Code',
        description: 'Please scan the QR code your partner is showing.',
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
      console.log('Joiner scanned raw data:', data?.substring(0, 20) + '...');
      
      const cleanData = data.replace('dodi:', '');
      const payload = decodePairingPayload(cleanData);
      
      if (!payload) {
        throw new Error('Invalid QR code - could not decode payload');
      }
      
      console.log('Decoded payload successfully');
      
      const joinerId = await completePairing(payload.creatorId, payload.passphrase);
      const answer = await acceptOffer(payload.offer);
      
      // Create the response object
      const response = {
        joinerId,
        answer,
        sessionId: payload.sessionId,
        shortCode: ''
      };
      
      // Encode using the new compressed format
      const encodedAnswer = encodeJoinerResponse(response);
      const fullAnswerString = `dodi-answer:${encodedAnswer}`;
      
      saveJoinerResponse(response);
      
      setAnswerQrData(fullAnswerString);
      setMode('joiner-show-answer');
      
      toast({
        title: 'QR scanned!',
        description: 'Now show your QR code to your partner.',
      });
      
    } catch (error) {
      console.error('Scan process error:', error);
      toast({
        title: 'Error processing QR',
        description: 'Failed to process QR code. Please try again.',
        variant: 'destructive',
      });
      setMode('choose');
    } finally {
      setLoading(false);
    }
  };

  // Request camera permissions
  const requestCameraPermission = async (): Promise<boolean> => {
    try {
      setRequestingPermission(true);
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      stream.getTracks().forEach(track => track.stop());
      setRequestingPermission(false);
      return true;
    } catch (error) {
      setRequestingPermission(false);
      console.error('Camera permission denied:', error);
      return false;
    }
  };

  const cleanupScanner = () => {
    if (scannerRef.current) {
      try {
        scannerRef.current.clear();
      } catch (e) { console.log(e); }
      scannerRef.current = null;
    }
    setScannerInitialized(false);
  };

  // Initialize QR scanner logic
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
      if (shouldScan) cleanupScanner();
    };
  }, [mode, scannerInitialized]);

  const initializeScanner = async (isCreatorScanning: boolean) => {
    try {
      const hasPermission = await requestCameraPermission();
      if (!hasPermission) {
        toast({ title: 'Camera Access Denied', description: 'Please allow camera access to scan.', variant: 'destructive' });
        setScannerInitialized(false);
        return;
      }
      
      const scanner = new Html5QrcodeScanner(
        'qr-reader',
        { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0, showTorchButtonIfSupported: true },
        false
      );

      scannerRef.current = scanner;
      setScannerInitialized(true);

      const successHandler = isCreatorScanning ? handleCreatorScanAnswer : handleJoinerScanCreator;
      await scanner.render(successHandler, (err) => console.warn(err));
    } catch (error) {
      console.error('Scanner init failed', error);
      setScannerInitialized(false);
    }
  };

  const handleCopyQrData = () => {
    const dataToCopy = mode === 'joiner-show-answer' 
      ? answerQrData 
      : (pairingPayload ? `dodi:${encodePairingPayload(pairingPayload)}` : '');
      
    navigator.clipboard.writeText(dataToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
              <Button onClick={handleCreatePairing} disabled={loading} className="w-full h-12 text-base">
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Heart className="w-5 h-5 mr-2" />}
                {loading ? 'Creating...' : 'Create Connection'}
              </Button>
              <Button onClick={() => setMode('joiner-scanning')} variant="outline" className="w-full h-12 text-base">
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
              <p className="text-sm text-muted-foreground">They'll scan this code to join</p>
            </div>
            <div className="flex justify-center p-6 bg-white rounded-lg">
              <QRCodeSVG
                value={creatorQrData}
                size={280}
                level="L"
                includeMargin
              />
            </div>
            <Button onClick={handleCopyQrData} variant="outline" className="w-full">
              {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
              {copied ? 'Copied!' : 'Copy Data'}
            </Button>
            <Button onClick={() => { clearPendingSession(); setPairingPayload(null); setMode('choose'); }} variant="ghost" className="w-full">
              Cancel
            </Button>
          </Card>
        )}

        {(mode === 'joiner-scanning' || mode === 'creator-scan-answer') && (
          <Card className="p-0 space-y-0 border-sage/30 overflow-hidden">
            <div className="p-8 space-y-4 text-center bg-gradient-to-b from-accent/5 to-transparent">
              <div className="space-y-1">
                <h2 className="text-xl font-light">
                  {mode === 'creator-scan-answer' ? 'Scan Their Response' : 'Scan Partner\'s QR'}
                </h2>
              </div>
            </div>
            <div id="qr-reader" className="w-full h-80 bg-muted"></div>
            <div className="p-8 space-y-3">
              <Button onClick={() => { cleanupScanner(); setMode(mode === 'creator-scan-answer' ? 'creator-show-qr' : 'choose'); }} variant="ghost" className="w-full">
                Back
              </Button>
            </div>
          </Card>
        )}

        {mode === 'joiner-show-answer' && answerQrData && (
          <Card className="p-8 space-y-6 border-sage/30">
            <div className="text-center space-y-2">
              <Heart className="w-8 h-8 mx-auto text-accent animate-gentle-bounce" />
              <h2 className="text-xl font-light">Now Show This to Partner</h2>
              <p className="text-sm text-muted-foreground">They scan this to complete connection</p>
            </div>
            <div className="flex justify-center p-6 bg-white rounded-lg">
              <QRCodeSVG
                value={answerQrData}
                size={260}
                level="L"
                includeMargin
              />
            </div>
            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg text-center">
               {peerState.connected ? (
                 <p className="text-green-700 dark:text-green-400 font-medium">Connected! Entering sanctuary...</p>
               ) : (
                 <p className="text-sm text-muted-foreground">Waiting for partner to scan...</p>
               )}
            </div>
             <Button onClick={() => { setAnswerQrData(''); setMode('choose'); }} variant="ghost" className="w-full">
              Start Over
            </Button>
          </Card>
        )}

        {loading && mode === 'choose' && (
          <div className="fixed inset-0 bg-background/80 flex items-center justify-center z-50">
            <Loader2 className="w-12 h-12 mx-auto animate-spin text-accent" />
          </div>
        )}
      </div>
    </div>
  );
}
