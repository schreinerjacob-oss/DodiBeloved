import { useState, useEffect, useRef } from 'react';
import { useDodi } from '@/contexts/DodiContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Heart, Loader2, Copy, Check, Leaf, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ThemeToggle } from '@/components/theme-toggle';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'framer-motion';
import { generateRoomCode, normalizeRoomCode, isValidRoomCode } from '@/lib/room-codes';
import { initializePeer, createRoomPeerId, getRemotePeerId, waitForConnection, connectToRoom, closeRoom, type RoomConnection } from '@/lib/peerjs-room';
import { runCreatorTunnel, runJoinerTunnel } from '@/lib/room-tunnel-protocol';
import dodiTypographyLogo from '@assets/generated_images/hebrew_dodi_typography_logo.png';

type Mode = 'choose' | 'pairing' | 'success-animation';

// Generate secure random token for QR code
function generateSecretToken(): string {
  const array = new Uint8Array(16);
  window.crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// Generate secure dodi:// URL with secret
function generateSecurePairingUrl(roomCode: string, secret: string): string {
  return `dodi://${roomCode}?secret=${secret}`;
}

// Parse dodi:// URL and extract room code and secret
function parsePairingUrl(url: string): { roomCode: string; secret: string } | null {
  try {
    // Handle both dodi:// and manual URL parsing
    let parsed = url;
    if (url.startsWith('dodi://')) {
      parsed = url.replace('dodi://', '');
    }
    
    const [code, query] = parsed.split('?');
    const params = new URLSearchParams(query || '');
    const secret = params.get('secret');
    
    if (!code || !secret) {
      return null;
    }
    
    return { roomCode: normalizeRoomCode(code), secret };
  } catch {
    return null;
  }
}

export default function PairingPage() {
  const { completePairingWithMasterKey, onPeerConnected, pairingStatus, userId } = useDodi();
  const { toast } = useToast();
  
  const [mode, setMode] = useState<Mode>('choose');
  const [roomCode, setRoomCode] = useState<string>('');
  const [secret, setSecret] = useState<string>('');
  const [inputUrl, setInputUrl] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isCreator, setIsCreator] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [error, setError] = useState<string>('');
  const roomRef = useRef<RoomConnection | null>(null);
  const retryCountRef = useRef<number>(0);
  const secretRef = useRef<string>('');

  useEffect(() => {
    if (pairingStatus === 'connected') {
      setShowSuccess(true);
    }
  }, [pairingStatus]);

  const handleMasterKeyReceived = async (payload: any) => {
    try {
      await completePairingWithMasterKey(payload.masterKey, payload.salt, payload.creatorId);
      onPeerConnected();
      if (roomRef.current) closeRoom(roomRef.current);
      setShowSuccess(true);
      setMode('success-animation');
    } catch (error) {
      if (roomRef.current) closeRoom(roomRef.current);
      const errorMsg = error instanceof Error ? error.message : 'Could not complete connection.';
      setError(errorMsg);
      toast({
        title: 'Pairing Failed',
        description: errorMsg,
        variant: 'destructive',
      });
      setMode('choose');
      setLoading(false);
    }
  };

  const handleCreateRoom = async () => {
    setLoading(true);
    setError('');
    setIsCreator(true);
    try {
      const code = generateRoomCode();
      const secretToken = generateSecretToken();
      setRoomCode(code);
      setSecret(secretToken);
      secretRef.current = secretToken;
      const myPeerId = createRoomPeerId(code, true);
      
      console.log('🌿 Creating room as creator with secret handshake:', code);
      const peer = await initializePeer(myPeerId);
      
      setMode('pairing');
      
      const connPromise = waitForConnection(peer, 120000).then(async (conn) => {
        roomRef.current = { peer, conn, isCreator: true, peerId: myPeerId };
        console.log('🔐 Creator tunnel starting with secure handshake');
        const payload = await runCreatorTunnel(conn, userId || '');
        await handleMasterKeyReceived(payload);
      });
      
      connPromise.catch((error) => {
        console.error('Creator connection error:', error);
        if (roomRef.current) {
          closeRoom(roomRef.current);
        }
        if (mode === 'pairing') {
          const errorMsg = error instanceof Error ? error.message : 'Partner did not connect. Try again.';
          setError(errorMsg);
          toast({ 
            title: 'Connection Failed', 
            description: errorMsg, 
            variant: 'destructive' 
          });
          setMode('choose');
          setLoading(false);
        }
      });
    } catch (error) {
      console.error('Create room error:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to create room.';
      setError(errorMsg);
      toast({ 
        title: 'Error', 
        description: errorMsg, 
        variant: 'destructive' 
      });
      setMode('choose');
      setLoading(false);
    }
  };

  const attemptJoinRoom = async (parsedData: { roomCode: string; secret: string }, isRetry: boolean = false) => {
    try {
      console.log(`🌿 ${isRetry ? 'Retrying' : 'Joining'} room as joiner with secure handshake:`, parsedData.roomCode);
      secretRef.current = parsedData.secret;
      
      const myPeerId = createRoomPeerId(parsedData.roomCode, false);
      const peer = await initializePeer(myPeerId);
      const remotePeerId = getRemotePeerId(parsedData.roomCode, false);
      const conn = await connectToRoom(peer, remotePeerId, 6000);
      roomRef.current = { peer, conn, isCreator: false, peerId: myPeerId };
      
      console.log('🔐 Joiner tunnel starting with secure handshake');
      const payload = await runJoinerTunnel(conn);
      await handleMasterKeyReceived(payload);
    } catch (error) {
      console.error(`Join room error (${isRetry ? 'retry' : 'attempt'} ${retryCountRef.current}):`, error);
      
      // If first attempt fails and we haven't retried yet, show "One moment…" and retry
      if (!isRetry && retryCountRef.current === 0) {
        retryCountRef.current = 1;
        setIsRetrying(true);
        
        // Wait 2 seconds then retry
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        try {
          await attemptJoinRoom(parsedData, true);
        } catch (retryError) {
          console.error('Retry failed:', retryError);
          if (roomRef.current) closeRoom(roomRef.current);
          const errorMsg = 'Creator may not be ready. Please try again.';
          setError(errorMsg);
          toast({ 
            title: 'Connection took too long', 
            description: errorMsg,
            variant: 'destructive' 
          });
          setMode('choose');
          setLoading(false);
          setIsRetrying(false);
          retryCountRef.current = 0;
        }
      } else {
        // Second attempt failed
        if (roomRef.current) closeRoom(roomRef.current);
        const errorMsg = 'Could not connect. Please try again.';
        setError(errorMsg);
        toast({ 
          title: 'Connection Failed', 
          description: errorMsg,
          variant: 'destructive' 
        });
        setMode('choose');
        setLoading(false);
        setIsRetrying(false);
        retryCountRef.current = 0;
      }
    }
  };

  const handleJoinRoom = async () => {
    const trimmedInput = inputUrl.trim();
    
    if (!trimmedInput) {
      const errorMsg = 'Please enter a pairing code or scan a QR code';
      setError(errorMsg);
      toast({ 
        title: 'Missing pairing code', 
        description: errorMsg, 
        variant: 'destructive' 
      });
      return;
    }
    
    // Try to parse as secure URL first
    let parsedData = parsePairingUrl(trimmedInput);
    
    // If not a URL, try as a plain room code
    if (!parsedData && isValidRoomCode(trimmedInput)) {
      parsedData = {
        roomCode: normalizeRoomCode(trimmedInput),
        secret: generateSecretToken(), // Generate a local secret if not provided
      };
    }
    
    if (!parsedData) {
      const errorMsg = 'Invalid pairing code. Please enter a valid code or scan a QR code.';
      setError(errorMsg);
      toast({ 
        title: 'Invalid code', 
        description: errorMsg, 
        variant: 'destructive' 
      });
      return;
    }
    
    setLoading(true);
    setError('');
    setIsCreator(false);
    setRoomCode(parsedData.roomCode);
    setSecret(parsedData.secret);
    setMode('pairing');
    retryCountRef.current = 0;
    setIsRetrying(false);
    
    await attemptJoinRoom(parsedData, false);
  };

  const handleCopyCode = () => {
    const securePairingUrl = generateSecurePairingUrl(roomCode, secret);
    navigator.clipboard.writeText(securePairingUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({
      title: "Copied!",
      description: "Secure pairing link copied to clipboard.",
    });
  };

  if (showSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-cream via-sage/10 to-blush/20 dark:from-background dark:via-card dark:to-secondary flex items-center justify-center p-6">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.6 }} className="text-center space-y-8 max-w-md">
          <motion.div 
            animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }} 
            transition={{ duration: 2, repeat: Infinity, repeatType: 'reverse' }} 
            className="relative inline-block"
          >
            <div className="absolute inset-0 bg-gold/30 rounded-full blur-3xl animate-pulse" />
            <div className="relative bg-gradient-to-br from-sage to-blush p-8 rounded-full">
              <Heart className="w-20 h-20 text-white" />
            </div>
          </motion.div>
          
          <motion.div 
            initial={{ y: 20, opacity: 0 }} 
            animate={{ y: 0, opacity: 1 }} 
            transition={{ delay: 0.3, duration: 0.5 }} 
            className="space-y-3"
          >
            <h1 className="text-3xl font-light text-foreground">Your Gardens Are Now</h1>
            <p className="text-4xl font-serif text-sage dark:text-sage">Eternally Connected</p>
          </motion.div>
          
          <motion.p 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            transition={{ delay: 0.8, duration: 0.8 }} 
            className="text-sm text-muted-foreground leading-relaxed"
          >
            All your messages are encrypted end-to-end and synced securely across your devices with verified peer-to-peer handshake.
          </motion.p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-cream via-sage/10 to-blush/20 dark:from-background dark:via-card dark:to-secondary flex items-center justify-center p-6">
      <div className="absolute top-4 right-4"><ThemeToggle /></div>
      
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-3">
          <img src={dodiTypographyLogo} alt="dodi" className="h-20 mx-auto" data-testid="img-logo" />
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
              className="space-y-4"
            >
              <Card className="p-6 space-y-4">
                <p className="text-sm text-muted-foreground text-center">
                  Pair with your beloved to begin your private sanctuary
                </p>
                <div className="space-y-3">
                  <Button 
                    onClick={handleCreateRoom} 
                    className="w-full" 
                    size="lg"
                    data-testid="button-create-pairing"
                  >
                    <Leaf className="w-4 h-4 mr-2" />
                    Create Pairing Code
                  </Button>
                  <Button 
                    onClick={() => setMode('pairing')} 
                    variant="outline" 
                    className="w-full" 
                    size="lg"
                    data-testid="button-join-pairing"
                  >
                    Enter Pairing Code
                  </Button>
                </div>
              </Card>
            </motion.div>
          )}

          {mode === 'pairing' && isCreator && roomCode && secret && !loading && (
            <motion.div 
              key="show-code" 
              initial={{ opacity: 0, y: 20 }} 
              animate={{ opacity: 1, y: 0 }} 
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              <Card className="p-6 space-y-6">
                <div className="text-center space-y-2">
                  <h2 className="text-lg font-light">Share This QR Code</h2>
                  <p className="text-xs text-muted-foreground">
                    Your beloved can scan this to connect securely
                  </p>
                </div>

                <div className="flex justify-center bg-white p-4 rounded-lg">
                  <QRCodeSVG 
                    value={generateSecurePairingUrl(roomCode, secret)}
                    size={200}
                    level="H"
                    includeMargin={true}
                    data-testid="qr-code-pairing"
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">OR SHARE CODE</p>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={generateSecurePairingUrl(roomCode, secret)}
                      readOnly
                      className="flex-1 px-3 py-2 text-xs font-mono bg-muted/50 border border-input rounded text-foreground"
                      data-testid="input-secure-pairing-url"
                    />
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      onClick={handleCopyCode}
                      data-testid="button-copy-pairing-url"
                    >
                      {copied ? (
                        <Check className="w-4 h-4 text-accent" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground text-center">
                  Waiting for your beloved to scan the code...
                </p>
              </Card>
            </motion.div>
          )}

          {mode === 'pairing' && !isCreator && !loading && (
            <motion.div 
              key="join-code" 
              initial={{ opacity: 0, y: 20 }} 
              animate={{ opacity: 1, y: 0 }} 
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              <Card className="p-6 space-y-4">
                <div>
                  <h2 className="text-lg font-light mb-2">Enter Pairing Code</h2>
                  <p className="text-xs text-muted-foreground mb-4">
                    Paste the secure link or enter the room code your beloved shared
                  </p>
                </div>

                {error && (
                  <div className="flex gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded text-sm text-destructive">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <Input 
                  placeholder="Paste dodi:// link or room code"
                  value={inputUrl}
                  onChange={(e) => {
                    setInputUrl(e.target.value);
                    setError('');
                  }}
                  data-testid="input-pairing-code"
                />

                <div className="flex gap-2">
                  <Button 
                    onClick={handleJoinRoom} 
                    className="flex-1"
                    disabled={!inputUrl.trim()}
                    data-testid="button-submit-pairing-code"
                  >
                    Connect
                  </Button>
                  <Button 
                    onClick={() => {
                      setMode('choose');
                      setInputUrl('');
                      setError('');
                    }} 
                    variant="outline"
                    data-testid="button-back-pairing"
                  >
                    Back
                  </Button>
                </div>
              </Card>
            </motion.div>
          )}

          {(mode === 'pairing' || isRetrying) && loading && (
            <motion.div 
              key="loading" 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-12 space-y-4"
            >
              <motion.div 
                animate={{ rotate: 360 }} 
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              >
                <Loader2 className="w-8 h-8 text-sage" />
              </motion.div>
              <div className="text-center space-y-1">
                <p className="text-sm font-light">{isRetrying ? 'One moment…' : 'Connecting securely'}</p>
                <p className="text-xs text-muted-foreground">
                  {isCreator ? 'Waiting for your beloved to join...' : 'Verifying secure handshake...'}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
