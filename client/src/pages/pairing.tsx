import { useState, useEffect, useRef } from 'react';
import { useDodi } from '@/contexts/DodiContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Heart, Loader2, Copy, Check, Leaf } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ThemeToggle } from '@/components/theme-toggle';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'framer-motion';
import { generateRoomCode, normalizeRoomCode, isValidRoomCode } from '@/lib/room-codes';
import { initializePeer, createRoomPeerId, getRemotePeerId, waitForConnection, connectToRoom, closeRoom, type RoomConnection } from '@/lib/peerjs-room';
import { runCreatorTunnel, runJoinerTunnel } from '@/lib/room-tunnel-protocol';
import dodiTypographyLogo from '@assets/generated_images/hebrew_dodi_typography_logo.png';

type Mode = 'choose' | 'pairing' | 'success-animation';

export default function PairingPage() {
  const { completePairingWithMasterKey, onPeerConnected, pairingStatus, userId } = useDodi();
  const { toast } = useToast();
  
  const [mode, setMode] = useState<Mode>('choose');
  const [roomCode, setRoomCode] = useState<string>('');
  const [inputCode, setInputCode] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isCreator, setIsCreator] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const roomRef = useRef<RoomConnection | null>(null);
  const retryCountRef = useRef<number>(0);

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
      toast({
        title: 'Pairing Failed',
        description: 'Could not complete connection.',
        variant: 'destructive',
      });
      setMode('choose');
      setLoading(false);
    }
  };

  const handleCreateRoom = async () => {
    setLoading(true);
    setIsCreator(true);
    try {
      const code = generateRoomCode();
      setRoomCode(code);
      const myPeerId = createRoomPeerId(code, true);
      
      console.log('🌿 Creating room as creator:', code);
      const peer = await initializePeer(myPeerId);
      
      setMode('pairing');
      
      const connPromise = waitForConnection(peer, 120000).then(async (conn) => {
        roomRef.current = { peer, conn, isCreator: true, peerId: myPeerId };
        const payload = await runCreatorTunnel(conn, userId || '');
        await handleMasterKeyReceived(payload);
      });
      
      connPromise.catch((error) => {
        console.error('Creator connection error:', error);
        if (roomRef.current) {
          closeRoom(roomRef.current);
        }
        if (mode === 'pairing') {
          toast({ title: 'Connection Failed', description: error instanceof Error ? error.message : 'Partner did not connect. Try again.', variant: 'destructive' });
          setMode('choose');
          setLoading(false);
        }
      });
    } catch (error) {
      console.error('Create room error:', error);
      toast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to create room.', variant: 'destructive' });
      setMode('choose');
      setLoading(false);
    }
  };

  const attemptJoinRoom = async (normalCode: string, isRetry: boolean = false) => {
    try {
      console.log(`🌿 ${isRetry ? 'Retrying' : 'Joining'} room as joiner:`, normalCode);
      const myPeerId = createRoomPeerId(normalCode, false);
      const peer = await initializePeer(myPeerId);
      const remotePeerId = getRemotePeerId(normalCode, false);
      const conn = await connectToRoom(peer, remotePeerId, 6000);
      roomRef.current = { peer, conn, isCreator: false, peerId: myPeerId };
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
          await attemptJoinRoom(normalCode, true);
        } catch (retryError) {
          console.error('Retry failed:', retryError);
          if (roomRef.current) closeRoom(roomRef.current);
          toast({ 
            title: 'Connection took too long', 
            description: 'Creator may not be ready. Please try again.',
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
        toast({ 
          title: 'Connection Failed', 
          description: 'Could not connect. Please try again.',
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
    if (!isValidRoomCode(inputCode)) {
      toast({ title: 'Invalid code', description: 'Please enter a valid 8-character code (e.g., A7K9-P2M4)', variant: 'destructive' });
      return;
    }
    
    setLoading(true);
    setIsCreator(false);
    const normalCode = normalizeRoomCode(inputCode);
    setRoomCode(normalCode);
    setMode('pairing');
    retryCountRef.current = 0;
    setIsRetrying(false);
    
    await attemptJoinRoom(normalCode, false);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
            All your messages are encrypted end-to-end and synced securely across your devices.
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
              transition={{ duration: 0.3 }}
            >
              <Card className="p-8 space-y-6 border-sage/30 shadow-lg">
                <div className="space-y-3 text-center">
                  <Heart className="w-8 h-8 mx-auto text-blush" />
                  <h2 className="text-2xl font-light">Hold Close and Connect</h2>
                  <p className="text-sm text-muted-foreground">A completely private sanctuary for you and your beloved</p>
                </div>

                <div className="space-y-3">
                  <Button 
                    onClick={handleCreateRoom} 
                    disabled={loading} 
                    className="w-full h-12 hover-elevate" 
                    data-testid="button-create-room"
                  >
                    {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Heart className="w-5 h-5 mr-2" />}
                    {loading ? 'Creating...' : 'Create Connection'}
                  </Button>

                  <Button 
                    onClick={() => { setInputCode(''); setMode('pairing'); setIsCreator(false); }} 
                    variant="outline" 
                    className="w-full h-12 hover-elevate" 
                    data-testid="button-join-code"
                  >
                    Join with Code
                  </Button>
                </div>
              </Card>
            </motion.div>
          )}

          {mode === 'pairing' && (
            <motion.div 
              key="pairing" 
              initial={{ opacity: 0, scale: 0.95 }} 
              animate={{ opacity: 1, scale: 1 }} 
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
            >
              <Card className="p-8 space-y-6 border-sage/30 shadow-lg">
                {isCreator ? (
                  <>
                    <div className="text-center space-y-2">
                      <h2 className="text-xl font-light">Share This Code</h2>
                      <p className="text-sm text-muted-foreground">Let your partner scan or type it</p>
                    </div>

                    <div className="text-center p-6 bg-sage/10 rounded-lg">
                      <p className="text-6xl font-light tracking-widest text-sage font-mono" data-testid="text-room-code">
                        {roomCode}
                      </p>
                    </div>

                    <div className="flex justify-center">
                      <div className="p-2 bg-white rounded-lg shadow-sm">
                        <QRCodeSVG 
                          value={roomCode} 
                          size={80} 
                          level="H" 
                          includeMargin={false}
                          data-testid="qr-room-code"
                        />
                      </div>
                    </div>

                    <Button 
                      variant="ghost" 
                      className="w-full" 
                      onClick={handleCopyCode} 
                      data-testid="button-copy-code"
                    >
                      {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                      {copied ? 'Copied!' : 'Copy Code'}
                    </Button>

                    {loading && (
                      <motion.div 
                        initial={{ opacity: 0 }} 
                        animate={{ opacity: 1 }} 
                        className="flex items-center justify-center gap-2 text-sm text-muted-foreground"
                      >
                        <motion.div animate={{ rotate: [0, 360] }} transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}>
                          <Leaf className="w-4 h-4 text-sage" />
                        </motion.div>
                        <span>Waiting for partner...</span>
                      </motion.div>
                    )}

                    <Button 
                      onClick={() => { 
                        if (roomRef.current) closeRoom(roomRef.current); 
                        setMode('choose'); 
                        setLoading(false); 
                      }} 
                      variant="ghost" 
                      className="w-full" 
                      disabled={loading}
                      data-testid="button-cancel"
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="text-center space-y-2">
                      <h2 className="text-xl font-light">Enter Code</h2>
                      <p className="text-sm text-muted-foreground">Your partner will share an 8-character code</p>
                    </div>

                    <Input 
                      type="text" 
                      placeholder="e.g., A7K9-P2M4" 
                      value={inputCode} 
                      onChange={(e) => setInputCode(e.target.value.toUpperCase())} 
                      disabled={loading} 
                      data-testid="input-room-code" 
                      className="text-lg font-mono text-center tracking-widest" 
                      maxLength={9}
                    />

                    {isRetrying && (
                      <motion.div
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-center py-2"
                      >
                        <p className="text-sm text-sage font-light">One moment…</p>
                        <motion.div
                          className="flex justify-center gap-1 mt-2"
                          animate={{ opacity: [0.5, 1, 0.5] }}
                          transition={{ duration: 1.5, repeat: Infinity }}
                        >
                          <div className="w-1.5 h-1.5 rounded-full bg-sage" />
                          <div className="w-1.5 h-1.5 rounded-full bg-sage" />
                          <div className="w-1.5 h-1.5 rounded-full bg-sage" />
                        </motion.div>
                      </motion.div>
                    )}

                    <Button 
                      onClick={handleJoinRoom} 
                      disabled={loading || !isValidRoomCode(inputCode)} 
                      className="w-full h-12 hover-elevate" 
                      data-testid="button-join-room"
                    >
                      {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Heart className="w-5 h-5 mr-2" />}
                      {loading ? 'Connecting...' : 'Connect'}
                    </Button>

                    <Button 
                      onClick={() => { setInputCode(''); setMode('choose'); }} 
                      variant="ghost" 
                      className="w-full" 
                      disabled={loading}
                      data-testid="button-cancel"
                    >
                      Back
                    </Button>
                  </>
                )}
              </Card>
            </motion.div>
          )}

          {mode === 'success-animation' && (
            <motion.div 
              key="success" 
              initial={{ opacity: 0, scale: 0.95 }} 
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
            >
              <Card className="p-8 space-y-6 border-sage/30 shadow-lg text-center">
                <motion.div 
                  animate={{ scale: [1, 1.05, 1] }} 
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  <Heart className="w-12 h-12 mx-auto text-blush" />
                </motion.div>
                <div>
                  <h2 className="text-xl font-light">Connected</h2>
                  <p className="text-sm text-muted-foreground mt-1">Your gardens are eternally connected</p>
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
